import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IntegrationUsageLogSource } from '../../common/constants/enums';
import { CurrencyConversionService } from '../exchange-rates/currency-conversion.service';
import { Affiliate } from '../affiliate/entities/affiliate.entity';
import { Contract } from '../contract/core/entities/contract.entity';
import { ContractLine } from '../contract/core/entities/contract-line.entity';
import { Arrangement } from '../hotel/entities/arrangement.entity';
import { Hotel } from '../hotel/entities/hotel.entity';
import { RoomType } from '../hotel/entities/room-type.entity';
import { SimulationContractMatcherService } from '../simulation/simulation-contract-matcher.service';
import { SimulationService } from '../simulation/simulation.service';
import { IntegrationApiKeysService } from './integration-api-keys.service';
import { IntegrationApiUsageLogsService } from './integration-api-usage-logs.service';
import { IntegrationEndpointsService } from './integration-endpoints.service';
import { RESERVATIONS_QUOTE_ENDPOINT_CODE } from './integration-endpoint-registry';
import { IntegrationPublicError } from './integration-public-error';
import { IntegrationQuoteService } from './integration-quote.service';

describe('IntegrationQuoteService', () => {
    let service: IntegrationQuoteService;

    const apiKeysService = {
        authenticate: jest.fn(),
        assertIpAllowed: jest.fn(),
        markUsed: jest.fn(),
    };
    const endpointsService = {
        findByCodeForTenant: jest.fn(),
    };
    const usageLogsService = {
        create: jest.fn(),
        countRecentRequests: jest.fn(),
    };
    const contractMatcher = {
        match: jest.fn(),
    };
    const simulationService = {
        calculate: jest.fn(),
    };
    const currencyConversionService = {
        resolveRate: jest.fn(),
    };

    const hotelRepo = { findOne: jest.fn() };
    const affiliateRepo = { findOne: jest.fn() };
    const roomTypeRepo = { findOne: jest.fn() };
    const arrangementRepo = { findOne: jest.fn() };
    const contractRepo = { findOne: jest.fn(), find: jest.fn() };
    const lineRepo = { find: jest.fn() };

    const createRawBody = (overrides: Partial<Record<string, unknown>> = {}) => ({
        requestId: 'REQ-100',
        hotelCode: 'HTL-01',
        partnerCode: 'PRT-01',
        reservationDate: '2026-05-01',
        checkIn: '2026-06-01',
        checkOut: '2026-06-03',
        currency: 'EUR',
        roomTypeCode: 'DBL',
        boardCode: 'RO',
        adults: 2,
        childrenAges: [],
        ...overrides,
    });

    const apiUser = {
        id: 4,
        tenantId: 7,
        status: 'ACTIVE',
        permissions: ['RESERVATIONS_QUOTE'],
        allowedHotels: [{ id: 12 }],
    };

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                IntegrationQuoteService,
                { provide: IntegrationApiKeysService, useValue: apiKeysService },
                { provide: IntegrationEndpointsService, useValue: endpointsService },
                { provide: IntegrationApiUsageLogsService, useValue: usageLogsService },
                { provide: SimulationContractMatcherService, useValue: contractMatcher },
                { provide: SimulationService, useValue: simulationService },
                { provide: CurrencyConversionService, useValue: currencyConversionService },
                { provide: getRepositoryToken(Hotel), useValue: hotelRepo },
                { provide: getRepositoryToken(Affiliate), useValue: affiliateRepo },
                { provide: getRepositoryToken(RoomType), useValue: roomTypeRepo },
                { provide: getRepositoryToken(Arrangement), useValue: arrangementRepo },
                { provide: getRepositoryToken(Contract), useValue: contractRepo },
                { provide: getRepositoryToken(ContractLine), useValue: lineRepo },
            ],
        }).compile();

        service = module.get(IntegrationQuoteService);

        apiKeysService.authenticate.mockResolvedValue({
            apiKey: { id: 8, environment: 'TEST', allowedIps: [] },
            apiUser,
        });
        apiKeysService.assertIpAllowed.mockReturnValue(undefined);
        apiKeysService.markUsed.mockResolvedValue(undefined);
        endpointsService.findByCodeForTenant.mockResolvedValue({
            id: 3,
            code: RESERVATIONS_QUOTE_ENDPOINT_CODE,
            status: 'ACTIVE',
            rateLimitPerMinute: 60,
        });
        usageLogsService.create.mockResolvedValue(undefined);
        usageLogsService.countRecentRequests.mockResolvedValue(0);
        hotelRepo.findOne.mockResolvedValue({ id: 12, name: 'Hotel 1', reference: 'HTL-01' });
        affiliateRepo.findOne.mockResolvedValue({ id: 18, companyName: 'Partner 1', reference: 'PRT-01' });
        roomTypeRepo.findOne.mockResolvedValue({ id: 21, code: 'DBL', name: 'Double Room' });
        arrangementRepo.findOne.mockResolvedValue({ id: 31, code: 'RO', name: 'Room Only' });
        contractMatcher.match.mockResolvedValue({
            status: 'single',
            candidates: [{ contractId: 51 }],
        });
        contractRepo.find.mockResolvedValue([
            { id: 51, hotelId: 12, startDate: '2026-01-01', endDate: '2026-12-31' },
        ]);
        contractRepo.findOne.mockResolvedValue({
            id: 51,
            hotelId: 12,
            name: 'Summer 2026',
            reference: 'CTR-01',
            status: 'ACTIVE',
            currency: 'EUR',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            baseArrangementId: 31,
        });
        lineRepo.find.mockResolvedValue([
            {
                id: 1,
                isContracted: true,
                period: { startDate: '2026-06-01', endDate: '2026-06-30' },
                contractRoom: { roomType: { id: 21 } },
                prices: [{ amount: 100, minStay: 1, releaseDays: 0, arrangement: { id: 31 } }],
            },
        ]);
        simulationService.calculate.mockResolvedValue({
            totalBrut: 400,
            totalGross: 400,
            roomsBreakdown: [
                {
                    roomTotalNet: 400,
                    dailyRates: [
                        {
                            date: '2026-06-01',
                            baseRate: 100,
                            promoRate: 100,
                            finalDailyRate: 200,
                            perPersonRate: 100,
                            isAvailable: true,
                            supplementsApplied: [],
                            promotionApplied: null,
                        },
                        {
                            date: '2026-06-02',
                            baseRate: 100,
                            promoRate: 100,
                            finalDailyRate: 200,
                            perPersonRate: 100,
                            isAvailable: true,
                            supplementsApplied: [],
                            promotionApplied: null,
                        },
                    ],
                    pricingTrace: [],
                },
            ],
        });
        currencyConversionService.resolveRate.mockResolvedValue({
            type: 'identity',
            rate: 1,
            missingRateReason: null,
        });
    });

    it('still requires X-API-Key on the public endpoint', async () => {
        apiKeysService.authenticate.mockRejectedValue(
            new IntegrationPublicError('INVALID_API_KEY', 401, 'The API key is missing or malformed.'),
        );

        const result = await service.handleQuote(createRawBody(), undefined, '127.0.0.1');

        expect(result.statusCode).toBe(401);
        expect(result.payload).toMatchObject({ errorCode: 'INVALID_API_KEY' });
        expect(result.trace.source).toBe(IntegrationUsageLogSource.PUBLIC_API);
    });

    it('returns ENDPOINT_DISABLED when the registry record is inactive', async () => {
        endpointsService.findByCodeForTenant.mockResolvedValue({
            id: 3,
            code: RESERVATIONS_QUOTE_ENDPOINT_CODE,
            status: 'INACTIVE',
            rateLimitPerMinute: 60,
        });

        const result = await service.handleQuote(createRawBody(), 'pik_key.secret', '127.0.0.1');

        expect(result.statusCode).toBe(403);
        expect(result.payload).toMatchObject({ errorCode: 'ENDPOINT_DISABLED' });
        expect(usageLogsService.create).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            source: IntegrationUsageLogSource.PUBLIC_API,
            errorCode: 'ENDPOINT_DISABLED',
        }));
    });

    it('returns a valid single-room quote request payload and writes a usage log', async () => {
        const result = await service.handleQuote(createRawBody(), 'pik_key.secret', '127.0.0.1');

        expect(result.statusCode).toBe(200);
        expect(result.payload).toMatchObject({
            requestId: 'REQ-100',
            status: 'QUOTED',
            hotelCode: 'HTL-01',
            partnerCode: 'PRT-01',
            contract: 'CTR-01',
            stay: {
                checkIn: '2026-06-01',
                checkOut: '2026-06-03',
                nights: 2,
            },
            pricing: {
                currency: 'EUR',
                totalBeforeDiscount: 400,
                discountAmount: 0,
                totalBeforeTax: 400,
                taxAmount: 0,
                grandTotal: 400,
            },
        });
        expect(result.payload).toMatchObject({
            pricing: {
                nightlyRates: [
                    {
                        date: '2026-06-01',
                        roomTypeCode: 'DBL',
                        boardCode: 'RO',
                        baseRate: 100,
                        discountAmount: 0,
                        supplementsAmount: 0,
                        totalBeforeTax: 200,
                    },
                    {
                        date: '2026-06-02',
                        roomTypeCode: 'DBL',
                        boardCode: 'RO',
                        baseRate: 100,
                        discountAmount: 0,
                        supplementsAmount: 0,
                        totalBeforeTax: 200,
                    },
                ],
                taxes: [],
            },
        });
        expect(result.payload.warnings).toContain(
            'Taxes are not configured in V1 quote calculations, so taxAmount is 0 and pricing.taxes is empty.',
        );
        expect(apiKeysService.markUsed).toHaveBeenCalledWith(8);
        expect(usageLogsService.create).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            source: IntegrationUsageLogSource.PUBLIC_API,
            requestId: 'REQ-100',
            hotelId: 12,
            apiKeyEnvironment: 'TEST',
            ipAddress: '127.0.0.1',
            endpointCode: RESERVATIONS_QUOTE_ENDPOINT_CODE,
            statusCode: 200,
        }));
    });

    it('returns IP_NOT_ALLOWED when the key allowlist rejects the request IP', async () => {
        apiKeysService.assertIpAllowed.mockImplementation(() => {
            throw new IntegrationPublicError('IP_NOT_ALLOWED', 403, 'The request IP address is not allowed for this API key.');
        });

        const result = await service.handleQuote(createRawBody(), 'pk_test_key.secret', '203.0.113.9');

        expect(result.statusCode).toBe(403);
        expect(result.payload).toMatchObject({ errorCode: 'IP_NOT_ALLOWED' });
        expect(usageLogsService.create).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            errorCode: 'IP_NOT_ALLOWED',
            apiKeyEnvironment: 'TEST',
            ipAddress: '203.0.113.9',
        }));
    });

    it('returns INVALID_PAYLOAD when reservationDate is missing', async () => {
        const invalidBody = createRawBody();
        delete (invalidBody as Record<string, unknown>).reservationDate;

        const result = await service.handleQuote(invalidBody, 'pik_key.secret', '127.0.0.1');

        expect(result.statusCode).toBe(400);
        expect(result.payload).toMatchObject({ errorCode: 'INVALID_PAYLOAD' });
        expect(usageLogsService.create).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            requestId: 'REQ-100',
            errorCode: 'INVALID_PAYLOAD',
        }));
    });

    it('returns INVALID_PAYLOAD when checkOut is before checkIn', async () => {
        const result = await service.handleQuote(
            createRawBody({
                checkIn: '2026-06-03',
                checkOut: '2026-06-01',
            }),
            'pik_key.secret',
            '127.0.0.1',
        );

        expect(result.statusCode).toBe(400);
        expect(result.payload).toMatchObject({
            errorCode: 'INVALID_PAYLOAD',
            message: 'checkOut must be after checkIn.',
        });
    });

    it('returns ROOM_TYPE_NOT_FOUND for an unknown roomTypeCode', async () => {
        roomTypeRepo.findOne.mockResolvedValue(null);

        const result = await service.handleQuote(
            createRawBody({ roomTypeCode: 'UNKNOWN' }),
            'pik_key.secret',
            '127.0.0.1',
        );

        expect(result.statusCode).toBe(404);
        expect(result.payload).toMatchObject({ errorCode: 'ROOM_TYPE_NOT_FOUND' });
    });

    it('returns BOARD_NOT_FOUND for an unknown boardCode', async () => {
        arrangementRepo.findOne.mockResolvedValue(null);

        const result = await service.handleQuote(
            createRawBody({ boardCode: 'UNKNOWN' }),
            'pik_key.secret',
            '127.0.0.1',
        );

        expect(result.statusCode).toBe(404);
        expect(result.payload).toMatchObject({ errorCode: 'BOARD_NOT_FOUND' });
    });

    it('returns CURRENCY_CONVERSION_MISSING when the requested currency is unsupported', async () => {
        currencyConversionService.resolveRate.mockResolvedValue({
            type: 'unresolved',
            rate: null,
            missingRateReason: 'No exchange rate is available for EUR to USD.',
        });

        const result = await service.handleQuote(
            createRawBody({ currency: 'USD' }),
            'pik_key.secret',
            '127.0.0.1',
        );

        expect(result.statusCode).toBe(422);
        expect(result.payload).toMatchObject({ errorCode: 'CURRENCY_CONVERSION_MISSING' });
    });

    it('defaults childrenAges to an empty array when omitted', async () => {
        const rawBody = createRawBody();
        delete (rawBody as Record<string, unknown>).childrenAges;

        const result = await service.handleQuote(rawBody, 'pik_key.secret', '127.0.0.1');

        expect(result.statusCode).toBe(200);
        expect(simulationService.calculate).toHaveBeenCalledWith(12, expect.objectContaining({
            roomingList: [
                {
                    roomId: 21,
                    boardTypeId: 31,
                    occupants: [
                        { paxOrder: 1, type: 'ADULT', age: 30 },
                        { paxOrder: 2, type: 'ADULT', age: 30 },
                    ],
                },
            ],
        }));
    });

    it('accepts childrenAges when provided as an empty array', async () => {
        const result = await service.handleQuote(
            createRawBody({ childrenAges: [] }),
            'pik_key.secret',
            '127.0.0.1',
        );

        expect(result.statusCode).toBe(200);
        expect(result.payload).toMatchObject({ status: 'QUOTED' });
    });

    it('passes reservationDate to the simulation engine for early booking evaluation', async () => {
        await service.handleQuote(
            createRawBody({ reservationDate: '2026-04-15' }),
            'pik_key.secret',
            '127.0.0.1',
        );

        expect(simulationService.calculate).toHaveBeenCalledWith(12, expect.objectContaining({
            bookingDate: '2026-04-15',
        }));
    });

    it('returns RELEASE_DAYS_NOT_SATISFIED when reservationDate violates lead time rules', async () => {
        lineRepo.find.mockResolvedValue([
            {
                id: 1,
                isContracted: true,
                period: { startDate: '2026-06-01', endDate: '2026-06-30' },
                contractRoom: { roomType: { id: 21 } },
                prices: [{ amount: 100, minStay: 1, releaseDays: 45, arrangement: { id: 31 } }],
            },
        ]);

        const result = await service.handleQuote(
            createRawBody({ reservationDate: '2026-05-20' }),
            'pik_key.secret',
            '127.0.0.1',
        );

        expect(result.statusCode).toBe(422);
        expect(result.payload).toMatchObject({ errorCode: 'RELEASE_DAYS_NOT_SATISFIED' });
    });

    it('writes a usage log when validation fails', async () => {
        const invalidBody = createRawBody({
            adults: 0,
        });

        const result = await service.handleQuote(invalidBody, 'pik_key.secret', '127.0.0.1');

        expect(result.statusCode).toBe(400);
        expect(usageLogsService.create).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            source: IntegrationUsageLogSource.PUBLIC_API,
            errorCode: 'INVALID_PAYLOAD',
            requestId: 'REQ-100',
        }));
    });
});
