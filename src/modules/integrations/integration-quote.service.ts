import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
    IntegrationApiKeyEnvironment,
    ContractStatus,
    IntegrationApiUserStatus,
    IntegrationEndpointStatus,
    IntegrationPermission,
    IntegrationUsageLogSource,
} from '../../common/constants/enums';
import { RequestUser } from '../../common/interfaces/request.interface';
import { Affiliate } from '../affiliate/entities/affiliate.entity';
import { Contract } from '../contract/core/entities/contract.entity';
import { ContractLine } from '../contract/core/entities/contract-line.entity';
import { Price } from '../contract/core/entities/price.entity';
import { CurrencyConversionService } from '../exchange-rates/currency-conversion.service';
import { Arrangement } from '../hotel/entities/arrangement.entity';
import { Hotel } from '../hotel/entities/hotel.entity';
import { RoomType } from '../hotel/entities/room-type.entity';
import {
    OccupantType as SimulationOccupantType,
    SimulationRequestDto,
} from '../simulation/dto/simulation-request.dto';
import { SimulationContractMatcherService } from '../simulation/simulation-contract-matcher.service';
import { SimulationService } from '../simulation/simulation.service';
import { TenantUsageService } from '../subscriptions/tenant-usage.service';
import { IntegrationApiKeysService } from './integration-api-keys.service';
import { IntegrationApiUsageLogsService } from './integration-api-usage-logs.service';
import {
    ReservationQuoteRequestDto,
    validateReservationQuoteRequest,
} from './dto/reservation-quote-request.dto';
import { IntegrationEndpointsService } from './integration-endpoints.service';
import { RESERVATIONS_QUOTE_ENDPOINT_CODE } from './integration-endpoint-registry';
import { IntegrationPublicError } from './integration-public-error';

interface QuoteExecutionContext {
    tenantId: number | null;
    apiUserId: number | null;
    apiKeyId: number | null;
    apiKeyEnvironment: IntegrationApiKeyEnvironment | null;
    hotelId: number | null;
    requestId: string | null;
}

interface QuoteExecutionTrace {
    source: IntegrationUsageLogSource;
    endpointCode: string;
    requestId: string | null;
    durationMs: number;
    apiUserId: number | null;
    apiKeyId: number | null;
    errorCode: string | null;
}

interface QuoteExecutionResult {
    statusCode: number;
    payload: Record<string, unknown>;
    trace: QuoteExecutionTrace;
}

interface SharedQuoteAccessContext {
    kind: 'integration-api-user' | 'playground';
    hotelIds?: number[];
    requiredHotelId?: number;
}

interface SharedQuoteResult {
    payload: Record<string, unknown>;
    requestId: string;
    hotelId: number;
}

interface ResolvedQuoteStay {
    roomType: RoomType;
    board: Arrangement;
    adults: number;
    childrenAges: number[];
}

@Injectable()
export class IntegrationQuoteService {
    private readonly logger = new Logger(IntegrationQuoteService.name);

    constructor(
        private readonly apiKeysService: IntegrationApiKeysService,
        private readonly endpointsService: IntegrationEndpointsService,
        private readonly usageLogsService: IntegrationApiUsageLogsService,
        private readonly contractMatcher: SimulationContractMatcherService,
        private readonly simulationService: SimulationService,
        private readonly currencyConversionService: CurrencyConversionService,
        private readonly tenantUsageService: TenantUsageService,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
        @InjectRepository(Affiliate)
        private readonly affiliateRepo: Repository<Affiliate>,
        @InjectRepository(RoomType)
        private readonly roomTypeRepo: Repository<RoomType>,
        @InjectRepository(Arrangement)
        private readonly arrangementRepo: Repository<Arrangement>,
        @InjectRepository(Contract)
        private readonly contractRepo: Repository<Contract>,
        @InjectRepository(ContractLine)
        private readonly lineRepo: Repository<ContractLine>,
    ) { }

    async handleQuote(rawBody: unknown, rawApiKey: string | undefined, ipAddress: string | null): Promise<QuoteExecutionResult> {
        const startedAt = Date.now();
        const context = this.createExecutionContext(rawBody);

        try {
            const { apiKey, apiUser } = await this.apiKeysService.authenticate(rawApiKey);
            context.tenantId = apiUser.tenantId ?? null;
            context.apiUserId = apiUser.id;
            context.apiKeyId = apiKey.id;
            context.apiKeyEnvironment = apiKey.environment;
            this.apiKeysService.assertIpAllowed(apiKey, ipAddress);
            await this.assertTenantPlanAllowsApiAccess(apiUser.tenantId ?? null);

            const endpoint = await this.endpointsService.findByCodeForTenant(
                RESERVATIONS_QUOTE_ENDPOINT_CODE,
                apiUser.tenantId ?? null,
            );
            if (!endpoint || endpoint.status !== IntegrationEndpointStatus.ACTIVE) {
                throw new IntegrationPublicError('ENDPOINT_DISABLED', 403, 'This integration endpoint is disabled.');
            }

            if (apiUser.status !== IntegrationApiUserStatus.ACTIVE) {
                throw new IntegrationPublicError('API_USER_INACTIVE', 403, 'The integration API user is inactive.');
            }

            if (!(apiUser.permissions ?? []).includes(IntegrationPermission.RESERVATIONS_QUOTE)) {
                throw new IntegrationPublicError('PERMISSION_DENIED', 403, 'The API user is not allowed to request reservation quotes.');
            }

            await this.assertRateLimit(apiKey.id, endpoint.rateLimitPerMinute);

            const quote = await this.executeSharedQuote({
                rawBody,
                tenantId: apiUser.tenantId ?? null,
                accessContext: {
                    kind: 'integration-api-user',
                    hotelIds: (apiUser.allowedHotels ?? []).map((hotel) => hotel.id),
                },
            });

            context.requestId = quote.requestId;
            context.hotelId = quote.hotelId;

            await this.safeMarkApiKeyUsed(apiKey.id);
            await this.writeUsageLog({
                tenantId: context.tenantId,
                endpointCode: RESERVATIONS_QUOTE_ENDPOINT_CODE,
                source: IntegrationUsageLogSource.PUBLIC_API,
                apiUserId: context.apiUserId,
                apiKeyId: context.apiKeyId,
                apiKeyEnvironment: apiKey.environment,
                hotelId: context.hotelId,
                requestId: context.requestId,
                externalReservationCode: null,
                statusCode: 200,
                success: true,
                errorCode: null,
                errorMessage: null,
                durationMs: Date.now() - startedAt,
                ipAddress,
                requestJson: this.sanitizeJson(rawBody),
                responseJson: this.sanitizeJson(quote.payload),
            });

            return {
                statusCode: 200,
                payload: quote.payload,
                trace: this.buildTrace(context, IntegrationUsageLogSource.PUBLIC_API, Date.now() - startedAt, null),
            };
        } catch (error) {
            return this.buildFailureResult(error, rawBody, context, startedAt, ipAddress, IntegrationUsageLogSource.PUBLIC_API);
        }
    }

    async handlePlaygroundQuote(
        rawBody: unknown,
        currentUser: RequestUser,
        hotelContextId: number,
        ipAddress: string | null,
    ): Promise<QuoteExecutionResult> {
        const startedAt = Date.now();
        const context = this.createExecutionContext(rawBody);
        context.tenantId = currentUser.tenantId ?? null;

        try {
            await this.assertTenantPlanAllowsApiAccess(currentUser.tenantId ?? null);

            const endpoint = await this.endpointsService.findByCodeForTenant(
                RESERVATIONS_QUOTE_ENDPOINT_CODE,
                currentUser.tenantId ?? null,
            );
            if (!endpoint || endpoint.status !== IntegrationEndpointStatus.ACTIVE) {
                throw new IntegrationPublicError('ENDPOINT_DISABLED', 403, 'This integration endpoint is disabled.');
            }

            const quote = await this.executeSharedQuote({
                rawBody,
                tenantId: currentUser.tenantId ?? null,
                accessContext: {
                    kind: 'playground',
                    requiredHotelId: hotelContextId,
                },
            });

            context.requestId = quote.requestId;
            context.hotelId = quote.hotelId;

            await this.writeUsageLog({
                tenantId: context.tenantId,
                endpointCode: RESERVATIONS_QUOTE_ENDPOINT_CODE,
                source: IntegrationUsageLogSource.PLAYGROUND,
                apiUserId: null,
                apiKeyId: null,
                apiKeyEnvironment: null,
                hotelId: context.hotelId,
                requestId: context.requestId,
                externalReservationCode: null,
                statusCode: 200,
                success: true,
                errorCode: null,
                errorMessage: null,
                durationMs: Date.now() - startedAt,
                ipAddress,
                requestJson: this.sanitizeJson(rawBody),
                responseJson: this.sanitizeJson(quote.payload),
            });

            return {
                statusCode: 200,
                payload: quote.payload,
                trace: this.buildTrace(context, IntegrationUsageLogSource.PLAYGROUND, Date.now() - startedAt, null),
            };
        } catch (error) {
            return this.buildFailureResult(error, rawBody, context, startedAt, ipAddress, IntegrationUsageLogSource.PLAYGROUND);
        }
    }

    private async executeSharedQuote(args: {
        rawBody: unknown;
        tenantId: number | null;
        accessContext: SharedQuoteAccessContext;
    }): Promise<SharedQuoteResult> {
        const dto = await validateReservationQuoteRequest(args.rawBody);

        const hotel = await this.resolveHotel(dto.hotelCode, args.tenantId);
        this.assertHotelAccess(hotel.id, args.accessContext);

        const partner = await this.resolvePartner(hotel.id, dto.partnerCode);
        const stay = await this.resolveStay(hotel.id, dto);
        const match = await this.contractMatcher.match({
            hotelId: hotel.id,
            affiliateId: partner.id,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
        });

        if (match.status === 'none' || match.candidates.length === 0) {
            throw new IntegrationPublicError('NO_ACTIVE_CONTRACT', 404, 'No active contract covers the requested partner and stay.');
        }

        const selectedContractId = await this.selectContractId(
            hotel.id,
            match.candidates.map((candidate) => candidate.contractId),
        );
        const contract = await this.contractRepo.findOne({
            where: { id: selectedContractId, hotelId: hotel.id },
            relations: ['baseArrangement'],
        });

        if (!contract || contract.status !== ContractStatus.ACTIVE) {
            throw new IntegrationPublicError('NO_ACTIVE_CONTRACT', 404, 'No active contract is available for the requested stay.');
        }

        const warnings: string[] = [];
        if (match.candidates.length > 1) {
            warnings.push('Multiple active contracts matched this stay. Pricify selected the most recent eligible contract for V1.');
        }

        await this.assertRateAvailability(contract, stay, dto.checkIn, dto.checkOut, dto.reservationDate);

        const simulationRequest: SimulationRequestDto = {
            contractId: contract.id,
            affiliateId: partner.id,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            bookingDate: dto.reservationDate,
            roomingList: [
                {
                    roomId: stay.roomType.id,
                    boardTypeId: stay.board.id,
                    occupants: [
                        ...Array.from({ length: stay.adults }).map((_, index) => ({
                            paxOrder: index + 1,
                            type: SimulationOccupantType.ADULT,
                            age: 30,
                        })),
                        ...stay.childrenAges.map((age, index) => ({
                            paxOrder: stay.adults + index + 1,
                            type: SimulationOccupantType.CHILD,
                            age,
                        })),
                    ],
                },
            ],
        };

        const simulation = await this.simulationService.calculate(hotel.id, simulationRequest);
        const conversion = await this.resolveCurrencyConversion(contract.currency, dto.currency, hotel.id, dto.checkIn);

        if (conversion.rate == null) {
            throw new IntegrationPublicError(
                'CURRENCY_CONVERSION_MISSING',
                422,
                conversion.missingRateReason ?? 'No currency conversion rate is configured.',
            );
        }

        if (conversion.type !== 'identity') {
            warnings.push(`Amounts were converted from ${contract.currency} to ${dto.currency}.`);
        }

        return {
            payload: this.buildQuotePayload({
                dto,
                hotel,
                partner,
                contract,
                stay,
                simulation,
                warnings,
                conversionRate: conversion.rate,
                responseCurrency: dto.currency,
            }),
            requestId: dto.requestId,
            hotelId: hotel.id,
        };
    }

    private async assertTenantPlanAllowsApiAccess(tenantId: number | null): Promise<void> {
        if (!tenantId) {
            throw new IntegrationPublicError('API_ACCESS_DISABLED', 403, 'API access is not enabled for this tenant plan.');
        }

        try {
            await this.tenantUsageService.assertCanUseApiAccess(tenantId);
        } catch {
            throw new IntegrationPublicError('API_ACCESS_DISABLED', 403, 'API access is not enabled for this tenant plan.');
        }
    }

    private async buildFailureResult(
        error: unknown,
        rawBody: unknown,
        context: QuoteExecutionContext,
        startedAt: number,
        ipAddress: string | null,
        source: IntegrationUsageLogSource,
    ): Promise<QuoteExecutionResult> {
        const normalizedError = this.normalizeError(error);
        const durationMs = Date.now() - startedAt;

        await this.writeUsageLog({
            tenantId: context.tenantId,
            endpointCode: RESERVATIONS_QUOTE_ENDPOINT_CODE,
            source,
            apiUserId: context.apiUserId,
            apiKeyId: context.apiKeyId,
            apiKeyEnvironment: context.apiKeyEnvironment,
            hotelId: context.hotelId,
            requestId: context.requestId,
            externalReservationCode: null,
            statusCode: normalizedError.statusCode,
            success: false,
            errorCode: normalizedError.errorCode,
            errorMessage: normalizedError.message,
            durationMs,
            ipAddress,
            requestJson: this.sanitizeJson(rawBody),
            responseJson: this.sanitizeJson({
                requestId: context.requestId,
                status: 'FAILED',
                errorCode: normalizedError.errorCode,
                error: {
                    code: normalizedError.errorCode,
                    message: normalizedError.message,
                },
                message: normalizedError.message,
            }),
        });

        const payload = {
            requestId: context.requestId,
            status: 'FAILED',
            errorCode: normalizedError.errorCode,
            error: {
                code: normalizedError.errorCode,
                message: normalizedError.message,
            },
            message: normalizedError.message,
        };

        return {
            statusCode: normalizedError.statusCode,
            payload,
            trace: this.buildTrace(context, source, durationMs, normalizedError.errorCode),
        };
    }

    private createExecutionContext(rawBody: unknown): QuoteExecutionContext {
        return {
            tenantId: null,
            apiUserId: null,
            apiKeyId: null,
            apiKeyEnvironment: null,
            hotelId: null,
            requestId: this.extractString(rawBody, 'requestId'),
        };
    }

    private buildTrace(
        context: QuoteExecutionContext,
        source: IntegrationUsageLogSource,
        durationMs: number,
        errorCode: string | null,
    ): QuoteExecutionTrace {
        return {
            source,
            endpointCode: RESERVATIONS_QUOTE_ENDPOINT_CODE,
            requestId: context.requestId,
            durationMs,
            apiUserId: context.apiUserId,
            apiKeyId: context.apiKeyId,
            errorCode,
        };
    }

    private assertHotelAccess(hotelId: number, accessContext: SharedQuoteAccessContext): void {
        if (accessContext.kind === 'integration-api-user') {
            const isHotelAllowed = (accessContext.hotelIds ?? []).includes(hotelId);
            if (!isHotelAllowed) {
                throw new IntegrationPublicError('HOTEL_NOT_ALLOWED', 403, 'The API user does not have access to this hotel.');
            }
            return;
        }

        if (accessContext.requiredHotelId !== hotelId) {
            throw new IntegrationPublicError('HOTEL_NOT_ALLOWED', 403, 'The authenticated admin is not allowed to test this hotel.');
        }
    }

    private async resolveHotel(hotelCode: string, tenantId: number | null): Promise<Hotel> {
        const hotel = await this.hotelRepo.findOne({
            where: [
                { tenantId: tenantId ?? IsNull(), reference: hotelCode },
                { tenantId: tenantId ?? IsNull(), name: hotelCode },
            ],
        });

        if (!hotel) {
            throw new IntegrationPublicError('HOTEL_NOT_FOUND', 404, `Hotel "${hotelCode}" was not found.`);
        }

        return hotel;
    }

    private async resolvePartner(hotelId: number, partnerCode: string): Promise<Affiliate> {
        const partner = await this.affiliateRepo.findOne({
            where: [
                { hotelId, reference: partnerCode },
                { hotelId, companyName: partnerCode },
            ],
        });

        if (!partner) {
            throw new IntegrationPublicError('PARTNER_NOT_FOUND', 404, `Partner "${partnerCode}" was not found.`);
        }

        return partner;
    }

    private async resolveStay(hotelId: number, dto: ReservationQuoteRequestDto): Promise<ResolvedQuoteStay> {
        const roomType = await this.roomTypeRepo.findOne({
            where: [
                { hotelId, code: dto.roomTypeCode },
                { hotelId, reference: dto.roomTypeCode },
            ],
        });
        if (!roomType) {
            throw new IntegrationPublicError('ROOM_TYPE_NOT_FOUND', 404, `Room type "${dto.roomTypeCode}" was not found.`);
        }

        const board = await this.arrangementRepo.findOne({
            where: [
                { hotelId, code: dto.boardCode },
                { hotelId, reference: dto.boardCode },
            ],
        });
        if (!board) {
            throw new IntegrationPublicError('BOARD_NOT_FOUND', 404, `Board "${dto.boardCode}" was not found.`);
        }

        return {
            roomType,
            board,
            adults: dto.adults,
            childrenAges: dto.childrenAges ?? [],
        };
    }

    private async selectContractId(hotelId: number, candidateIds: number[]): Promise<number> {
        const contracts = await this.contractRepo.find({
            where: { id: In(candidateIds), hotelId },
        });
        const sorted = [...contracts].sort((left, right) => {
            const startDiff = new Date(right.startDate).getTime() - new Date(left.startDate).getTime();
            if (startDiff !== 0) return startDiff;
            const endDiff = new Date(left.endDate).getTime() - new Date(right.endDate).getTime();
            if (endDiff !== 0) return endDiff;
            return right.id - left.id;
        });

        return sorted[0]?.id ?? candidateIds[0];
    }

    private async assertRateAvailability(
        contract: Contract,
        stay: ResolvedQuoteStay,
        checkIn: string,
        checkOut: string,
        reservationDate: string,
    ): Promise<void> {
        const lines = await this.lineRepo.find({
            where: {
                period: { contract: { id: contract.id } },
            },
            relations: ['period', 'contractRoom', 'contractRoom.roomType', 'prices', 'prices.arrangement'],
        });

        const start = this.toLocalDate(checkIn);
        const end = this.toLocalDate(checkOut);
        const totalNights = Math.ceil((end.getTime() - start.getTime()) / 86400000);
        const bookingDate = this.toLocalDate(reservationDate);
        const leadTime = Math.ceil((start.getTime() - bookingDate.getTime()) / 86400000);

        for (let offset = 0; offset < totalNights; offset++) {
            const currentDate = new Date(start);
            currentDate.setDate(start.getDate() + offset);

            const line = lines.find((item) => {
                const lineStart = this.toLocalDate(item.period.startDate);
                const lineEnd = this.toLocalDate(item.period.endDate);
                return (
                    item.contractRoom.roomType.id === stay.roomType.id
                    && currentDate >= lineStart
                    && currentDate <= lineEnd
                );
            });

            if (!line) {
                throw new IntegrationPublicError('MISSING_RATE', 422, `No rate was found for room type "${stay.roomType.code}".`);
            }

            if (!line.isContracted) {
                throw new IntegrationPublicError(
                    'MISSING_RATE',
                    422,
                    `No contracted availability or allotment was found for room type "${stay.roomType.code}". Stop-sale status is not exposed in V1.`,
                );
            }

            const price = this.selectBasePrice(line, contract.baseArrangementId);
            if (!price) {
                throw new IntegrationPublicError('MISSING_RATE', 422, `No base rate was found for room type "${stay.roomType.code}".`);
            }

            if (price.minStay > totalNights) {
                throw new IntegrationPublicError('MIN_STAY_NOT_SATISFIED', 422, 'The requested stay does not satisfy the minimum stay rule.');
            }

            if (price.releaseDays > 0 && leadTime < price.releaseDays) {
                throw new IntegrationPublicError('RELEASE_DAYS_NOT_SATISFIED', 422, 'The requested stay does not satisfy the release days rule.');
            }
        }
    }

    private async resolveCurrencyConversion(
        fromCurrency: string,
        toCurrency: string,
        hotelId: number,
        asOfDate: string,
    ) {
        return this.currencyConversionService.resolveRate(fromCurrency, toCurrency, hotelId, asOfDate);
    }

    private buildQuotePayload(args: {
        dto: ReservationQuoteRequestDto;
        hotel: Hotel;
        partner: Affiliate;
        contract: Contract;
        stay: ResolvedQuoteStay;
        simulation: Awaited<ReturnType<SimulationService['calculate']>>;
        warnings: string[];
        conversionRate: number;
        responseCurrency: string;
    }): Record<string, unknown> {
        const {
            dto,
            hotel,
            partner,
            contract,
            stay,
            simulation,
            warnings,
            conversionRate,
            responseCurrency,
        } = args;

        const roomBreakdown = simulation.roomsBreakdown[0];
        const convertAmount = (value: number) => this.round(value * conversionRate, 3);
        const addGroupedAmount = (group: Map<string, number>, name: string, amount: number) => {
            group.set(name, this.round((group.get(name) ?? 0) + amount, 3));
        };
        const groupedDiscounts = new Map<string, number>();
        const groupedSupplements = new Map<string, number>();

        for (const dailyRate of roomBreakdown?.dailyRates ?? []) {
            if (dailyRate.promotionApplied?.amount) {
                addGroupedAmount(
                    groupedDiscounts,
                    dailyRate.promotionApplied.name,
                    convertAmount(Math.abs(dailyRate.promotionApplied.amount)),
                );
            }

            for (const reduction of dailyRate.reductionsApplied ?? []) {
                if (this.isSupplementAdjustment(reduction.name)) {
                    addGroupedAmount(groupedSupplements, reduction.name, convertAmount(reduction.amount));
                }
            }

            for (const supplement of dailyRate.supplementsApplied ?? []) {
                addGroupedAmount(groupedSupplements, supplement.name, convertAmount(supplement.amount));
            }
        }

        for (const modifier of simulation.stayModifiers ?? []) {
            if (modifier.amount < 0) {
                addGroupedAmount(groupedDiscounts, modifier.name, convertAmount(Math.abs(modifier.amount)));
            } else if (modifier.amount > 0) {
                addGroupedAmount(groupedSupplements, modifier.name, convertAmount(modifier.amount));
            }
        }

        const nightlyRates = (roomBreakdown?.dailyRates ?? []).map((dailyRate) => {
            const discountAmount = dailyRate.promotionApplied?.amount
                ? convertAmount(Math.abs(dailyRate.promotionApplied.amount))
                : 0;
            const supplementsAmount = (dailyRate.supplementsApplied ?? []).reduce(
                (sum, supplement) => sum + convertAmount(supplement.amount),
                0,
            ) + (dailyRate.reductionsApplied ?? []).reduce(
                (sum, reduction) => sum + (
                    this.isSupplementAdjustment(reduction.name)
                        ? convertAmount(reduction.amount)
                        : 0
                ),
                0,
            );

            return {
                date: dailyRate.date,
                roomTypeCode: stay.roomType.code,
                boardCode: stay.board.code,
                baseRate: convertAmount(dailyRate.baseRate),
                occupancy: this.buildNightlyOccupancyPricing(dailyRate, stay, conversionRate),
                discountAmount: this.round(discountAmount, 3),
                supplementsAmount: this.round(supplementsAmount, 3),
                totalBeforeTax: convertAmount(dailyRate.finalDailyRate),
            };
        });

        const discountAmount = this.round(
            Array.from(groupedDiscounts.values()).reduce((sum, amount) => sum + amount, 0),
            3,
        );
        const totalBeforeTax = convertAmount(simulation.totalGross);
        const totalBeforeDiscount = this.round(totalBeforeTax + discountAmount, 3);
        const taxAmount = 0;
        const grandTotal = this.round(totalBeforeTax + taxAmount, 3);
        const taxes: Array<Record<string, unknown>> = [];
        warnings.push('Taxes are not configured in V1 quote calculations, so taxAmount is 0 and pricing.taxes is empty.');

        return {
            requestId: dto.requestId,
            status: 'QUOTED',
            hotelCode: hotel.reference ?? hotel.name,
            partnerCode: partner.reference ?? partner.companyName,
            contract: contract.reference ?? contract.name,
            stay: {
                checkIn: dto.checkIn,
                checkOut: dto.checkOut,
                nights: this.daysBetween(dto.checkIn, dto.checkOut),
            },
            pricing: {
                currency: responseCurrency,
                nightlyLineMode: 'commercial_pricing_basis',
                nightlyLineModeLabel: 'Nightly amounts are before stay-level discounts. Discounts are summarized below.',
                nightlyRates,
                discounts: Array.from(groupedDiscounts.entries()).map(([name, amount]) => ({ name, amount })),
                reductions: [],
                supplements: Array.from(groupedSupplements.entries()).map(([name, amount]) => ({ name, amount })),
                taxes,
                totalBeforeDiscount,
                discountAmount,
                totalBeforeTax,
                taxAmount,
                grandTotal,
            },
            warnings: Array.from(new Set(warnings)),
        };
    }

    private normalizeError(error: unknown): IntegrationPublicError {
        if (error instanceof IntegrationPublicError) {
            return error;
        }

        this.logger.error('Unhandled integration quote error', error instanceof Error ? error.stack : undefined);
        return new IntegrationPublicError('INTERNAL_ERROR', 500, 'An unexpected error occurred while processing the quote.');
    }

    private extractString(payload: unknown, key: string): string | null {
        if (!payload || typeof payload !== 'object') return null;
        const value = (payload as Record<string, unknown>)[key];
        return typeof value === 'string' ? value : null;
    }

    private selectBasePrice(line: ContractLine, baseArrangementId?: number | null): Price | null {
        if (!line.prices?.length) return null;
        if (!baseArrangementId) return line.prices[0];
        return line.prices.find((price) => price.arrangement?.id === baseArrangementId) ?? line.prices[0];
    }

    private toLocalDate(value: string | Date): Date {
        const date = new Date(value);
        return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0);
    }

    private daysBetween(checkIn: string, checkOut: string): number {
        return Math.ceil((this.toLocalDate(checkOut).getTime() - this.toLocalDate(checkIn).getTime()) / 86400000);
    }

    private round(value: number, precision: number): number {
        const factor = Math.pow(10, precision);
        return Math.round(value * factor) / factor;
    }

    private buildNightlyOccupancyPricing(
        dailyRate: {
            baseRate: number;
            netRate?: number;
            reductionsApplied?: Array<{ name: string; amount: number }>;
        },
        stay: ResolvedQuoteStay,
        conversionRate: number,
    ): Record<string, unknown> {
        const convertAmount = (value: number) => this.round(value * conversionRate, 3);
        const baseRate = Number(dailyRate.baseRate) || 0;
        const adjustments = (dailyRate.reductionsApplied ?? []).filter((modifier) => !this.isSupplementAdjustment(modifier.name));
        const extraAdultParts = adjustments
            .map((modifier) => {
                const match = String(modifier.name ?? '').match(/^(?:Adulte|Adult)\s+(\d+)/i);
                if (!match) return null;
                const amount = Number(modifier.amount) || 0;
                if (amount <= 0) return null;
                return {
                    type: 'extra_adult',
                    label: `Adult ${match[1]}`,
                    unitAmount: convertAmount(amount),
                    quantity: 1,
                    amount: convertAmount(amount),
                    percentageOfBase: baseRate > 0 ? this.round((amount / baseRate) * 100, 3) : null,
                    reductionPercentage: baseRate > 0 ? this.round(100 - ((amount / baseRate) * 100), 3) : null,
                };
            })
            .filter(Boolean) as Array<Record<string, unknown>>;

        const basisParts: Array<Record<string, unknown>> = [];
        const baseAdultQuantity = Math.max(0, stay.adults - extraAdultParts.length);
        let rawBasisAmount = baseRate * baseAdultQuantity;
        if (baseAdultQuantity > 0) {
            basisParts.push({
                type: 'adult',
                label: 'Adults',
                unitAmount: convertAmount(baseRate),
                quantity: baseAdultQuantity,
                amount: convertAmount(baseRate * baseAdultQuantity),
            });
        }
        basisParts.push(...extraAdultParts);

        adjustments.forEach((modifier) => {
            const match = String(modifier.name ?? '').match(/^(?:Enfant|Child)\s+(\d+)(?:\s+\(([^)]+)\))?/i);
            if (!match) return;
            const amount = Number(modifier.amount) || 0;
            if (amount <= 0) return;
            rawBasisAmount += amount;
            basisParts.push({
                type: 'child',
                label: `${match[0]}`,
                unitAmount: convertAmount(amount),
                quantity: 1,
                amount: convertAmount(amount),
                percentageOfBase: baseRate > 0 ? this.round((amount / baseRate) * 100, 3) : null,
            });
        });

        adjustments.forEach((modifier) => {
            const match = String(modifier.name ?? '').match(/^(?:Adulte|Adult)\s+(\d+)/i);
            if (!match) return;
            const amount = Number(modifier.amount) || 0;
            if (amount > 0) rawBasisAmount += amount;
        });

        const occupancyAmount = convertAmount(
            dailyRate.netRate !== undefined && dailyRate.netRate !== null
                ? Number(dailyRate.netRate) || 0
                : rawBasisAmount,
        );
        const knownAmount = this.round(
            basisParts.reduce((sum, part) => sum + (typeof part.amount === 'number' ? part.amount : 0), 0),
            3,
        );
        const residual = this.round(occupancyAmount - knownAmount, 3);
        if (Math.abs(residual) > 0.005) {
            basisParts.push({
                type: 'adjustment',
                label: 'Occupancy adjustment',
                unitAmount: residual,
                quantity: 1,
                amount: residual,
            });
        }

        return {
            adults: stay.adults,
            children: stay.childrenAges.length,
            total: stay.adults + stay.childrenAges.length,
            amount: occupancyAmount,
            pricingBasisParts: basisParts,
        };
    }

    private isSupplementAdjustment(name: string): boolean {
        const normalized = name.toLowerCase();
        return normalized.includes('suppl');
    }

    private async assertRateLimit(apiKeyId: number, rateLimitPerMinute: number): Promise<void> {
        const recentRequestCount = await this.usageLogsService.countRecentRequests(
            apiKeyId,
            RESERVATIONS_QUOTE_ENDPOINT_CODE,
            new Date(Date.now() - 60_000),
        );

        if (recentRequestCount >= rateLimitPerMinute) {
            throw new IntegrationPublicError(
                'RATE_LIMIT_EXCEEDED',
                429,
                `The rate limit of ${rateLimitPerMinute} request(s) per minute was exceeded for this API key.`,
            );
        }
    }

    private async safeMarkApiKeyUsed(apiKeyId: number): Promise<void> {
        try {
            await this.apiKeysService.markUsed(apiKeyId);
        } catch (error) {
            this.logger.warn(
                `Failed to update lastUsedAt for integration API key ${apiKeyId}`,
                error instanceof Error ? error.stack : undefined,
            );
        }
    }

    private async writeUsageLog(input: {
        tenantId: number | null;
        endpointCode: string;
        source: IntegrationUsageLogSource;
        apiUserId: number | null;
        apiKeyId: number | null;
        apiKeyEnvironment: IntegrationApiKeyEnvironment | null;
        hotelId: number | null;
        requestId: string | null;
        externalReservationCode: string | null;
        statusCode: number;
        success: boolean;
        errorCode: string | null;
        errorMessage: string | null;
        durationMs: number;
        ipAddress: string | null;
        requestJson?: Record<string, unknown> | null;
        responseJson?: Record<string, unknown> | null;
    }): Promise<void> {
        try {
            await this.usageLogsService.create(input);
        } catch (error) {
            this.logger.warn(
                `Failed to persist integration usage log for ${input.endpointCode}`,
                error instanceof Error ? error.stack : undefined,
            );
        }
    }

    private sanitizeJson(value: unknown): Record<string, unknown> | null {
        if (value == null || typeof value !== 'object') return null;
        return this.sanitizeValue(value) as Record<string, unknown>;
    }

    private sanitizeValue(value: unknown): unknown {
        if (Array.isArray(value)) {
            return value.map((item) => this.sanitizeValue(item));
        }
        if (!value || typeof value !== 'object') {
            return value;
        }

        const sensitiveKeys = new Set([
            'authorization',
            'x-api-key',
            'apikey',
            'rawkey',
            'hashedsecret',
            'secret',
            'token',
            'password',
        ]);
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
                key,
                sensitiveKeys.has(key.toLowerCase()) ? '[REDACTED]' : this.sanitizeValue(entryValue),
            ]),
        );
    }
}
