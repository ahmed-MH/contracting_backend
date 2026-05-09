import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, DeepPartial, IsNull, Not, Repository } from 'typeorm';
import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { ProformaSequence } from './entities/proforma-sequence.entity';
import { ProformaPdfService } from './proforma-pdf.service';
import { CreateProformaDto } from './dto/create-proforma.dto';
import { ListIssuedProformasDto } from './dto/list-issued-proformas.dto';
import { UpdateProformaPreviewSettingsDto } from './dto/update-proforma-preview-settings.dto';
import { ProformaInvoiceStatus } from '../../common/constants/enums';
import { Hotel } from '../hotel/entities/hotel.entity';
import { CurrencyConversionService, CurrencyRateResolution } from '../exchange-rates/currency-conversion.service';
import { RequestUser } from '../../common/interfaces/request.interface';
import { AuditService } from '../../common/audit/audit.service';
import { PageDto } from '../../common/dto/page.dto';

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const SOURCE_CALCULATION_SNAPSHOT_KEY = '__sourceCalculationSnapshot';
const SOURCE_CURRENCY_KEY = '__sourceCurrency';
const FX_RESOLUTION_KEY = '__fxResolution';
const PROFORMA_VIEW_KEY = 'proformaView';
const DEFAULT_TAX_NAME = 'VAT / tax';
const DISCOUNT_SEMANTICS = 'SPO, Early Booking, and promotional discounts aggregated from backend pricing trace stages; child and occupancy reductions remain embedded in net nightly pricing.';
const MONETARY_CALCULATION_KEYS = new Set([
    'amount',
    'baseRate',
    'netRate',
    'promoRate',
    'finalDailyRate',
    'perPersonRate',
    'roomTotalNet',
    'totalBrut',
    'totalRemise',
    'totalGross',
    'totalNet',
    'beforeAmount',
    'deltaAmount',
    'afterAmount',
    'totalSaving',
    'grossNightlyAmount',
    'nightlyCommercialAmount',
    'nightlyUnitAmount',
    'unitAmount',
    'nightlyDiscountAmount',
    'netNightlyAmount',
    'supplementsAmount',
    'roomGrossAmountBeforeDiscount',
    'roomDiscountAmount',
    'roomNetAmountBeforeTax',
    'grossAmountBeforeDiscount',
    'discountAmount',
    'netAmountBeforeTax',
    'totalAmount',
]);

type ProformaTaxSettings = {
    taxEnabled: boolean;
    taxAmount: number | null;
    taxName: string | null;
};

type DiscountSource = {
    label: string;
    amount: number;
    sourceType?: string;
    sourceId?: number;
    scope: 'nightly' | 'room' | 'stay' | 'global';
    displayInNightlyRows: boolean;
    displayInSummary: boolean;
    commercialLabel: string;
    roomIndex?: number;
};

type ProformaDocumentSnapshot = {
    hotel: {
        id: number | null;
        name: string | null;
        reference: string | null;
        address: string | null;
        phone: string | null;
        emails: Array<{ label?: string; address: string }>;
        logoUrl: string | null;
        themeColor: string | null;
    };
    affiliate: {
        id: number | null;
        companyName: string | null;
        reference: string | null;
        address: string | null;
        emails: Array<{ label?: string; address: string }>;
    } | null;
};

type ProformaDownloadResult = {
    proforma: ProformaInvoice;
    filename: string;
    buffer: Buffer;
    issuedNow: boolean;
};

@Injectable()
export class ProformaService {
    constructor(
        @InjectRepository(ProformaInvoice)
        private readonly proformaRepo: Repository<ProformaInvoice>,
        @InjectRepository(ProformaSequence)
        private readonly sequenceRepo: Repository<ProformaSequence>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
        private readonly dataSource: DataSource,
        private readonly currencyConversion: CurrencyConversionService,
        private readonly auditService: AuditService,
        private readonly pdfService: ProformaPdfService,
    ) {}

    /**
     * Create a persisted draft preview from a simulation snapshot.
     */
    async create(
        hotelId: number,
        currentUser: RequestUser | undefined,
        dto: CreateProformaDto,
    ): Promise<ProformaInvoice> {
        const actor = await this.auditService.resolveActor(currentUser);
        const hotel = await this.hotelRepo.findOne({ where: { id: hotelId } });
        const taxSettings = this.normalizeTaxSettings(dto);
        const currency = this.normalizeCurrency(dto.currency);
        const totalsSnapshot = this.buildTotalsSnapshot(dto, taxSettings, currency);
        const documentThemeColor = this.normalizeThemeColor(hotel?.preferredThemeColor);
        const calculationSnapshot = this.withPricingMetadata(
            dto.calculationResult,
            dto.calculationResult,
            currency,
            currency,
            this.identityRateResolution(hotelId, currency),
            totalsSnapshot,
            dto.roomingSummary,
        );

        const data: DeepPartial<ProformaInvoice> = {
            hotelId,
            affiliateId: dto.affiliateId,
            contractId: dto.contractId,
            generatedByUserId: actor.userId ?? undefined,
            reference: this.generateDraftReference(hotelId),
            status: ProformaInvoiceStatus.DRAFT,
            currency,
            taxEnabled: taxSettings.taxEnabled,
            taxAmount: taxSettings.taxAmount,
            documentLogoUrl: hotel?.logoUrl ?? undefined,
            documentThemeColor: documentThemeColor ?? undefined,
            customerName: dto.customerName,
            customerEmail: dto.customerEmail ?? undefined,
            checkIn: dto.checkIn as any,
            checkOut: dto.checkOut as any,
            bookingDate: dto.bookingDate as any,
            voucherNumber: this.normalizeVoucherNumber(dto.voucherNumber),
            boardTypeName: dto.boardTypeName,
            roomingSummary: dto.roomingSummary,
            simulationInputSnapshot: dto.simulationInput,
            calculationSnapshot,
            totalsSnapshot,
            notes: dto.notes ?? undefined,
            generatedAt: new Date(),
        };

        const proforma = this.proformaRepo.create(data);
        this.auditService.applyCreateAudit(proforma, actor, proforma.generatedAt);
        return this.proformaRepo.save(proforma);
    }

    async updatePreviewSettings(
        hotelId: number,
        id: number,
        dto: UpdateProformaPreviewSettingsDto,
        currentUser?: RequestUser,
    ): Promise<ProformaInvoice> {
        const proforma = await this.findOne(hotelId, id);
        this.assertPreviewSettingsEditable(proforma);
        const actor = await this.auditService.resolveActor(currentUser);
        const currentCurrency = this.normalizeCurrency(proforma.currency);
        const targetCurrency = this.normalizeCurrency(dto.currency ?? currentCurrency);
        const sourceCurrency = this.sourceCurrency(proforma);
        const sourceCalculation = this.sourceCalculationSnapshot(proforma);
        const rateResolution = await this.resolveDocumentRate(hotelId, sourceCurrency, targetCurrency, proforma.bookingDate);
        const convertedCalculation = this.convertCalculationSnapshot(sourceCalculation, rateResolution.rate ?? 1, targetCurrency);
        const taxSettings = await this.resolvePreviewTaxSettings(proforma, dto, targetCurrency);
        const totalsSnapshot = this.buildTotalsSnapshot(
            {
                ...this.proformaToTotalsDto(proforma),
                currency: targetCurrency,
                calculationResult: convertedCalculation,
            },
            taxSettings,
            targetCurrency,
            sourceCurrency,
            rateResolution,
        );

        proforma.currency = targetCurrency;
        proforma.taxEnabled = taxSettings.taxEnabled;
        proforma.taxAmount = taxSettings.taxAmount;
        proforma.calculationSnapshot = this.withPricingMetadata(
            convertedCalculation,
            sourceCalculation,
            sourceCurrency,
            targetCurrency,
            rateResolution,
            totalsSnapshot,
            proforma.roomingSummary,
        );
        proforma.totalsSnapshot = totalsSnapshot;

        if (this.hasOwn(dto, 'notes')) {
            proforma.notes = (dto.notes?.trim() || undefined) as any;
        }

        if (this.hasOwn(dto, 'voucherNumber')) {
            proforma.voucherNumber = this.normalizeVoucherNumber(dto.voucherNumber);
        }

        this.auditService.applyUpdateAudit(proforma, actor);
        await this.proformaRepo.save(proforma);
        return this.findOne(hotelId, id);
    }

    /**
     * List all proformas for a hotel, newest first.
     */
    async findAll(hotelId: number): Promise<ProformaInvoice[]> {
        return this.proformaRepo.find({
            where: { hotelId },
            order: { issuedAt: 'DESC', generatedAt: 'DESC' },
        });
    }

    async findIssuedInvoices(hotelId: number, filters: ListIssuedProformasDto): Promise<PageDto<ProformaInvoice>> {
        const query = this.proformaRepo
            .createQueryBuilder('proforma')
            .where('proforma.hotelId = :hotelId', { hotelId })
            .andWhere('proforma.status IN (:...statuses)', {
                statuses: [ProformaInvoiceStatus.ISSUED, ProformaInvoiceStatus.GENERATED],
            });

        const search = filters.search?.trim();
        if (search) {
            query.andWhere(
                '(proforma.reference LIKE :search OR proforma.customerName LIKE :search OR proforma.customerEmail LIKE :search)',
                { search: `%${search}%` },
            );
        }

        if (filters.affiliateId) {
            query.andWhere('proforma.affiliateId = :affiliateId', { affiliateId: filters.affiliateId });
        }

        if (filters.issuedFrom) {
            query.andWhere('proforma.issuedAt >= :issuedFrom', { issuedFrom: `${filters.issuedFrom}T00:00:00.000` });
        }

        if (filters.issuedTo) {
            query.andWhere('proforma.issuedAt <= :issuedTo', { issuedTo: `${filters.issuedTo}T23:59:59.999` });
        }

        const [data, total] = await query
            .orderBy('proforma.issuedAt', 'DESC')
            .addOrderBy('proforma.id', 'DESC')
            .skip(filters.skip)
            .take(filters.limit)
            .getManyAndCount();

        return new PageDto(data, total, filters.page, filters.limit);
    }

    async findArchivedIssuedInvoices(hotelId: number, filters: ListIssuedProformasDto): Promise<PageDto<ProformaInvoice>> {
        const query = this.proformaRepo
            .createQueryBuilder('proforma')
            .withDeleted()
            .where('proforma.hotelId = :hotelId', { hotelId })
            .andWhere('proforma.deletedAt IS NOT NULL')
            .andWhere('proforma.status IN (:...statuses)', {
                statuses: [ProformaInvoiceStatus.ISSUED, ProformaInvoiceStatus.GENERATED],
            });

        const search = filters.search?.trim();
        if (search) {
            query.andWhere(
                '(proforma.reference LIKE :search OR proforma.customerName LIKE :search OR proforma.customerEmail LIKE :search)',
                { search: `%${search}%` },
            );
        }

        if (filters.affiliateId) {
            query.andWhere('proforma.affiliateId = :affiliateId', { affiliateId: filters.affiliateId });
        }

        if (filters.issuedFrom) {
            query.andWhere('proforma.issuedAt >= :issuedFrom', { issuedFrom: `${filters.issuedFrom}T00:00:00.000` });
        }

        if (filters.issuedTo) {
            query.andWhere('proforma.issuedAt <= :issuedTo', { issuedTo: `${filters.issuedTo}T23:59:59.999` });
        }

        const [data, total] = await query
            .orderBy('proforma.issuedAt', 'DESC')
            .addOrderBy('proforma.id', 'DESC')
            .skip(filters.skip)
            .take(filters.limit)
            .getManyAndCount();

        return new PageDto(data, total, filters.page, filters.limit);
    }

    /**
     * Get a single proforma by ID, scoped to hotel.
     */
    async findOne(hotelId: number, id: number): Promise<ProformaInvoice> {
        const proforma = await this.loadProforma(hotelId, id);

        if (!proforma) {
            throw new NotFoundException(`Proforma #${id} not found`);
        }

        if (proforma.status === ProformaInvoiceStatus.DRAFT) {
            await this.ensureCurrentCommercialSnapshot(proforma);
        }
        return proforma;
    }

    async downloadPdf(
        hotelId: number,
        id: number,
        language: string | undefined,
        currentUser?: RequestUser,
    ): Promise<ProformaDownloadResult> {
        const proforma = await this.loadRequiredProforma(hotelId, id);

        if (this.isIssuedLikeStatus(proforma.status)) {
            return this.buildDownloadResult(proforma, language, false);
        }

        this.assertDraftEditable(proforma);
        await this.ensureCurrentCommercialSnapshot(proforma);

        const actor = await this.auditService.resolveActor(currentUser);
        const issuedAt = new Date();
        const issuedReference = await this.generateReference(hotelId);
        const documentSnapshot = this.buildDocumentSnapshot(proforma);
        const documentLogoUrl = documentSnapshot.hotel.logoUrl ?? proforma.documentLogoUrl ?? null;
        const documentThemeColor = documentSnapshot.hotel.themeColor ?? proforma.documentThemeColor ?? null;

        proforma.reference = issuedReference;
        proforma.status = ProformaInvoiceStatus.ISSUED;
        proforma.documentLogoUrl = documentLogoUrl ?? undefined;
        proforma.documentThemeColor = documentThemeColor ?? undefined;
        proforma.documentSnapshot = documentSnapshot;
        proforma.issuedAt = issuedAt;
        proforma.issuedByUserId = actor.userId ?? null;
        proforma.issuedByName = actor.name;
        proforma.issuedByEmail = actor.email;

        this.auditService.applyUpdateAudit(proforma, actor, issuedAt);
        const result = await this.buildDownloadResult(proforma, language, true);
        await this.proformaRepo.save(proforma);
        return result;
    }

    async downloadIssuedPdf(
        hotelId: number,
        id: number,
        language: string | undefined,
    ): Promise<ProformaDownloadResult> {
        const proforma = await this.loadRequiredProforma(hotelId, id);
        if (!this.isIssuedLikeStatus(proforma.status)) {
            throw new BadRequestException('Draft proformas must be issued from the download action before PDF export.');
        }
        return this.buildDownloadResult(proforma, language, false);
    }

    async archive(hotelId: number, id: number): Promise<void> {
        const proforma = await this.proformaRepo.findOne({ where: { id, hotelId } });
        if (!proforma) {
            throw new NotFoundException(`Proforma #${id} not found`);
        }

        const result = await this.proformaRepo.softDelete({ id, hotelId, deletedAt: IsNull() });
        if (result.affected === 0) {
            throw new NotFoundException(`Proforma #${id} not found`);
        }
    }

    async restore(hotelId: number, id: number): Promise<void> {
        const proforma = await this.proformaRepo.findOne({
            where: { id, hotelId, deletedAt: Not(IsNull()) },
            withDeleted: true,
        });
        if (!proforma) {
            throw new NotFoundException(`Proforma #${id} not found or not archived`);
        }

        const result = await this.proformaRepo.restore({ id, hotelId });
        if (result.affected === 0) {
            throw new NotFoundException(`Proforma #${id} not found or not archived`);
        }
    }

    private async ensureCurrentCommercialSnapshot(proforma: ProformaInvoice): Promise<void> {
        if (!this.needsCommercialSnapshotUpgrade(proforma)) {
            return;
        }

        const documentCurrency = this.normalizeCurrency(proforma.currency);
        const documentCalculation = this.withoutInternalMetadata(proforma.calculationSnapshot ?? {});
        const sourceCalculation = this.sourceCalculationSnapshot(proforma);
        const sourceCurrency = this.sourceCurrency(proforma);
        const fxResolution = this.existingFxResolution(proforma, sourceCurrency, documentCurrency);
        const taxSettings: ProformaTaxSettings = {
            taxEnabled: proforma.taxEnabled === true || proforma.totalsSnapshot?.taxEnabled === true,
            taxAmount: this.numberOrNull(proforma.taxAmount) ?? this.numberOrNull(proforma.totalsSnapshot?.taxAmount),
            taxName: this.normalizeTaxName(proforma.totalsSnapshot?.taxName),
        };

        if (!taxSettings.taxEnabled) {
            taxSettings.taxAmount = null;
            taxSettings.taxName = null;
        }

        const totalsSnapshot = this.buildTotalsSnapshot(
            {
                ...this.proformaToTotalsDto(proforma),
                currency: documentCurrency,
                calculationResult: documentCalculation,
            },
            taxSettings,
            documentCurrency,
            sourceCurrency,
            fxResolution,
        );

        proforma.totalsSnapshot = totalsSnapshot;
        proforma.calculationSnapshot = this.withPricingMetadata(
            documentCalculation,
            sourceCalculation,
            sourceCurrency,
            documentCurrency,
            fxResolution,
            totalsSnapshot,
            proforma.roomingSummary,
        );

        this.auditService.applyUpdateAudit(proforma, this.auditService.systemActor());
        await this.proformaRepo.save(proforma);
    }

    private needsCommercialSnapshotUpgrade(proforma: ProformaInvoice): boolean {
        const view = proforma.calculationSnapshot?.[PROFORMA_VIEW_KEY];
        if (!view || view.nightlyLineMode !== 'commercial_pricing_basis') return true;

        const rooms = Array.isArray(view.rooms) ? view.rooms : [];
        return rooms.some((room: any) => {
            const dailyRates = Array.isArray(room?.dailyRates) ? room.dailyRates : [];
            return dailyRates.some((day: any) => (
                this.numberOrNull(day?.nightlyCommercialAmount) == null
                || this.numberOrNull(day?.nightlyUnitAmount) == null
                || !Array.isArray(day?.nightlyBasisParts)
            ));
        });
    }

    private existingFxResolution(
        proforma: ProformaInvoice,
        sourceCurrency: string,
        documentCurrency: string,
    ): CurrencyRateResolution {
        const fx = proforma.calculationSnapshot?.[FX_RESOLUTION_KEY] ?? {};
        return {
            hotelId: proforma.hotelId,
            sourceCurrency,
            targetCurrency: documentCurrency,
            type: (fx.type ?? proforma.totalsSnapshot?.fxConversionMode ?? proforma.totalsSnapshot?.exchangeRateType ?? (sourceCurrency === documentCurrency ? 'identity' : 'direct')) as CurrencyRateResolution['type'],
            rate: this.numberOrNull(fx.rate) ?? this.numberOrNull(proforma.totalsSnapshot?.exchangeRateUsed) ?? this.numberOrNull(proforma.totalsSnapshot?.exchangeRate) ?? (sourceCurrency === documentCurrency ? 1 : null),
            rateDate: fx.rateDate ?? proforma.totalsSnapshot?.fxRateDate ?? proforma.totalsSnapshot?.exchangeRateDate ?? new Date().toISOString().slice(0, 10),
            pivotCurrency: fx.pivotCurrency ?? proforma.totalsSnapshot?.exchangeRatePivotCurrency ?? null,
            pairsUsed: Array.isArray(fx.pairsUsed) ? fx.pairsUsed : [],
        };
    }

    private normalizeTaxSettings(dto: CreateProformaDto): ProformaTaxSettings {
        const taxEnabled = dto.taxEnabled === true;
        if (!taxEnabled) {
            return { taxEnabled: false, taxAmount: null, taxName: null };
        }

        const taxAmount = this.toCurrencyAmount(dto.taxAmount ?? 0);
        if (taxAmount < 0) {
            throw new BadRequestException('taxAmount cannot be negative');
        }

        return { taxEnabled: true, taxAmount, taxName: this.normalizeTaxName(dto.taxName) };
    }

    private buildTotalsSnapshot(
        dto: CreateProformaDto,
        taxSettings: ProformaTaxSettings,
        documentCurrency = this.normalizeCurrency(dto.currency),
        sourceCurrency = documentCurrency,
        fxResolution: CurrencyRateResolution = this.identityRateResolution(0, documentCurrency),
    ): Record<string, any> {
        const calculation = dto.calculationResult ?? {};
        const discountTotal = this.toCurrencyAmount(this.authoritativeDiscountAmount(calculation, dto.totals));
        const netBeforeTax = this.toCurrencyAmount(
            this.firstNumber(calculation.totalNet, calculation.totalGross, dto.totals?.netBeforeTax, dto.totals?.grandTotal),
        );
        const subtotal = this.toCurrencyAmount(netBeforeTax + discountTotal);
        const taxAmount = taxSettings.taxEnabled ? this.toCurrencyAmount(taxSettings.taxAmount ?? 0) : null;
        const grandTotal = this.toCurrencyAmount(netBeforeTax + (taxAmount ?? 0));

        return {
            grossAmountBeforeDiscount: subtotal,
            subtotal,
            discountAmount: discountTotal,
            discountTotal,
            netBeforeTax,
            netAmountBeforeTax: netBeforeTax,
            taxEnabled: taxSettings.taxEnabled,
            taxName: taxSettings.taxEnabled ? taxSettings.taxName : null,
            taxAmount,
            taxCurrency: documentCurrency,
            grandTotal,
            totalAmount: grandTotal,
            sourceCurrency,
            documentCurrency,
            exchangeRate: fxResolution.rate ?? null,
            exchangeRateUsed: fxResolution.rate ?? null,
            exchangeRateType: fxResolution.type,
            fxConversionMode: fxResolution.type,
            exchangeRateDate: fxResolution.rateDate,
            fxRateDate: fxResolution.rateDate,
            exchangeRatePivotCurrency: fxResolution.pivotCurrency ?? null,
            discountSources: this.discountSources(calculation),
            discountSemantics: DISCOUNT_SEMANTICS,
            pricingLineMode: 'semantic_discount_summary',
        };
    }

    private authoritativeDiscountAmount(calculation: any, inputTotals?: any): number {
        const traceDiscount = this.discountFromPricingTrace(calculation);
        if (traceDiscount > 0) return traceDiscount;

        const modifierDiscount = this.discountFromAppliedModifiers(calculation);
        if (modifierDiscount > 0) return modifierDiscount;

        return this.firstNumber(calculation?.totalRemise, inputTotals?.discountTotal, 0);
    }

    private discountFromPricingTrace(calculation: any): number {
        const rooms = Array.isArray(calculation?.roomsBreakdown) ? calculation.roomsBreakdown : [];
        const discountStages = new Set(['spo', 'early_booking', 'email_spo']);
        const total = rooms.reduce((sum: number, room: any) => {
            const trace = Array.isArray(room?.pricingTrace) ? room.pricingTrace : [];
            return sum + trace.reduce((roomSum: number, item: any) => {
                if (!discountStages.has(String(item?.stage ?? '').toLowerCase())) return roomSum;
                const delta = this.firstNumber(item?.deltaAmount);
                return delta < 0 ? roomSum + Math.abs(delta) : roomSum;
            }, 0);
        }, 0);

        return this.toCurrencyAmount(total);
    }

    private discountFromAppliedModifiers(calculation: any): number {
        const rooms = Array.isArray(calculation?.roomsBreakdown) ? calculation.roomsBreakdown : [];
        const dailyDiscount = rooms.reduce((sum: number, room: any) => {
            const dailyRates = Array.isArray(room?.dailyRates) ? room.dailyRates : [];
            return sum + dailyRates.reduce((daySum: number, day: any) => {
                const amount = this.firstNumber(day?.promotionApplied?.amount);
                return amount < 0 ? daySum + Math.abs(amount) : daySum;
            }, 0);
        }, 0);
        const stayModifiers = Array.isArray(calculation?.stayModifiers) ? calculation.stayModifiers : [];
        const stayDiscount = stayModifiers.reduce((sum: number, modifier: any) => {
            const amount = this.firstNumber(modifier?.amount);
            const name = String(modifier?.name ?? '').toLowerCase();
            const isDiscount = name.includes('spo') || name.includes('early booking');
            return amount < 0 && isDiscount ? sum + Math.abs(amount) : sum;
        }, 0);

        return this.toCurrencyAmount(dailyDiscount + stayDiscount);
    }

    private sourceCalculationSnapshot(proforma: ProformaInvoice): any {
        const snapshot = proforma.calculationSnapshot ?? {};
        return this.deepClone(snapshot[SOURCE_CALCULATION_SNAPSHOT_KEY] ?? this.withoutInternalMetadata(snapshot));
    }

    private sourceCurrency(proforma: ProformaInvoice): string {
        const calculationCurrency = proforma.calculationSnapshot?.[SOURCE_CURRENCY_KEY];
        const totalsCurrency = proforma.totalsSnapshot?.sourceCurrency;
        return this.normalizeCurrency(calculationCurrency ?? totalsCurrency ?? proforma.currency);
    }

    private withoutInternalMetadata(snapshot: any): any {
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
            return snapshot;
        }

        const clone = this.deepClone(snapshot);
        delete clone[SOURCE_CALCULATION_SNAPSHOT_KEY];
        delete clone[SOURCE_CURRENCY_KEY];
        delete clone[FX_RESOLUTION_KEY];
        delete clone[PROFORMA_VIEW_KEY];
        return clone;
    }

    private withPricingMetadata(
        documentCalculation: any,
        sourceCalculation: any,
        sourceCurrency: string,
        documentCurrency: string,
        fxResolution: CurrencyRateResolution,
        totalsSnapshot: Record<string, any>,
        roomingSummary: any,
    ): any {
        return {
            ...this.deepClone(documentCalculation ?? {}),
            [SOURCE_CALCULATION_SNAPSHOT_KEY]: this.deepClone(sourceCalculation ?? {}),
            [SOURCE_CURRENCY_KEY]: sourceCurrency,
            documentCurrency,
            [PROFORMA_VIEW_KEY]: this.buildProformaView(documentCalculation, totalsSnapshot, documentCurrency, roomingSummary),
            [FX_RESOLUTION_KEY]: {
                type: fxResolution.type,
                rate: fxResolution.rate,
                rateDate: fxResolution.rateDate,
                pivotCurrency: fxResolution.pivotCurrency ?? null,
                pairsUsed: fxResolution.pairsUsed,
            },
        };
    }

    private async resolveDocumentRate(
        hotelId: number,
        sourceCurrency: string,
        targetCurrency: string,
        asOfDate?: Date | string | null,
    ): Promise<CurrencyRateResolution> {
        const resolution = await this.currencyConversion.resolveRate(sourceCurrency, targetCurrency, hotelId, asOfDate);
        if (resolution.rate == null) {
            throw new BadRequestException(resolution.missingRateReason ?? `No exchange rate is available for ${sourceCurrency} to ${targetCurrency}.`);
        }
        return resolution;
    }

    private convertCalculationSnapshot(snapshot: any, rate: number, targetCurrency: string): any {
        const convert = (value: any, key?: string): any => {
            if (key === SOURCE_CALCULATION_SNAPSHOT_KEY) return this.deepClone(value);
            if (Array.isArray(value)) return value.map((item) => convert(item));
            if (value && typeof value === 'object') {
                return Object.fromEntries(
                    Object.entries(value).map(([entryKey, entryValue]) => [entryKey, convert(entryValue, entryKey)]),
                );
            }
            if (key === 'currency' && typeof value === 'string') return targetCurrency;
            if (key && MONETARY_CALCULATION_KEYS.has(key)) {
                const numeric = this.numberOrNull(value);
                if (numeric != null) return this.toCurrencyAmount(numeric * rate);
            }
            return value;
        };

        return convert(this.withoutInternalMetadata(snapshot ?? {}));
    }

    private async resolvePreviewTaxSettings(
        proforma: ProformaInvoice,
        dto: UpdateProformaPreviewSettingsDto,
        targetCurrency: string,
    ): Promise<ProformaTaxSettings> {
        const taxEnabled = this.hasOwn(dto, 'taxEnabled') ? dto.taxEnabled === true : proforma.taxEnabled === true;
        if (!taxEnabled) return { taxEnabled: false, taxAmount: null, taxName: null };

        const taxName = this.hasOwn(dto, 'taxName')
            ? this.normalizeTaxName(dto.taxName)
            : this.normalizeTaxName(proforma.totalsSnapshot?.taxName);

        if (this.hasOwn(dto, 'taxAmount')) {
            const taxAmount = this.toCurrencyAmount(dto.taxAmount ?? 0);
            if (taxAmount < 0) throw new BadRequestException('taxAmount cannot be negative');
            return { taxEnabled: true, taxAmount, taxName };
        }

        const currentTax = this.numberOrNull(proforma.taxAmount)
            ?? this.numberOrNull(proforma.totalsSnapshot?.taxAmount)
            ?? 0;
        const currentCurrency = this.normalizeCurrency(proforma.currency);
        if (currentCurrency === targetCurrency) {
            return { taxEnabled: true, taxAmount: this.toCurrencyAmount(currentTax), taxName };
        }

        const conversion = await this.currencyConversion.convertAmount(
            currentTax,
            currentCurrency,
            targetCurrency,
            proforma.hotelId,
            proforma.bookingDate,
        );
        if (conversion.convertedAmount == null) {
            throw new BadRequestException(conversion.missingRateReason ?? `No exchange rate is available for ${currentCurrency} to ${targetCurrency}.`);
        }

        return { taxEnabled: true, taxAmount: this.toCurrencyAmount(conversion.convertedAmount), taxName };
    }

    private proformaToTotalsDto(proforma: ProformaInvoice): CreateProformaDto {
        return {
            affiliateId: proforma.affiliateId,
            contractId: proforma.contractId,
            customerName: proforma.customerName,
            customerEmail: proforma.customerEmail,
            checkIn: String(proforma.checkIn),
            checkOut: String(proforma.checkOut),
            bookingDate: String(proforma.bookingDate),
            voucherNumber: proforma.voucherNumber ?? undefined,
            boardTypeName: proforma.boardTypeName,
            currency: proforma.currency,
            roomingSummary: proforma.roomingSummary,
            simulationInput: proforma.simulationInputSnapshot,
            calculationResult: proforma.calculationSnapshot,
            totals: proforma.totalsSnapshot,
            notes: proforma.notes,
            taxEnabled: proforma.taxEnabled,
            taxAmount: proforma.taxAmount ?? undefined,
            taxName: proforma.totalsSnapshot?.taxName ?? undefined,
        };
    }

    private identityRateResolution(hotelId: number, currency: string): CurrencyRateResolution {
        return {
            hotelId,
            sourceCurrency: currency,
            targetCurrency: currency,
            type: 'identity',
            rate: 1,
            rateDate: new Date().toISOString().slice(0, 10),
            pairsUsed: [],
        };
    }

    private firstNumber(...values: unknown[]): number {
        for (const value of values) {
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
            if (typeof value === 'string' && value.trim() !== '') {
                const parsed = Number(value);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }
        }
        return 0;
    }

    private toCurrencyAmount(value: unknown): number {
        const numeric = this.firstNumber(value);
        return Math.round((numeric + Number.EPSILON) * 100) / 100;
    }

    private numberOrNull(value: unknown): number | null {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string' && value.trim() !== '') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    }

    private normalizeCurrency(value?: string | null): string {
        const currency = (value ?? '').trim().toUpperCase();
        if (!currency) throw new BadRequestException('currency is required');
        return currency;
    }

    private normalizeTaxName(value?: string | null): string {
        const trimmed = (value ?? '').trim();
        return trimmed ? trimmed.slice(0, 80) : DEFAULT_TAX_NAME;
    }

    private normalizeVoucherNumber(value?: string | null): string | null {
        const trimmed = (value ?? '').trim();
        return trimmed ? trimmed.slice(0, 100) : null;
    }

    private discountSources(calculation: any): DiscountSource[] {
        const sources = new Map<string, DiscountSource>();
        const traceSources = new Map<string, DiscountSource>();
        const rooms = Array.isArray(calculation?.roomsBreakdown) ? calculation.roomsBreakdown : [];
        const discountStages = new Set(['spo', 'early_booking', 'email_spo']);

        rooms.forEach((room: any) => {
            const roomIndex = this.numberOrNull(room?.roomIndex) ?? undefined;
            const dailyRates = Array.isArray(room?.dailyRates) ? room.dailyRates : [];
            dailyRates.forEach((day: any) => {
                const amount = this.firstNumber(day?.promotionApplied?.amount);
                if (amount >= 0) return;
                this.addDiscountSource(sources, {
                    label: String(day?.promotionApplied?.name ?? 'Nightly promotion'),
                    amount: Math.abs(amount),
                    scope: 'nightly',
                    displayInNightlyRows: true,
                    displayInSummary: false,
                    commercialLabel: String(day?.promotionApplied?.name ?? 'Nightly promotion'),
                    roomIndex,
                });
            });

            const trace = Array.isArray(room?.pricingTrace) ? room.pricingTrace : [];
            trace.forEach((item: any) => {
                const stage = String(item?.stage ?? '').toLowerCase();
                const delta = this.firstNumber(item?.deltaAmount);
                if (!discountStages.has(stage) || delta >= 0) return;

                const label = String(
                    item?.label
                    ?? (stage === 'early_booking'
                        ? 'Early Booking'
                        : stage === 'email_spo'
                            ? 'Email SPO'
                            : 'SPO'),
                );
                const sourceType = item?.sourceType ? String(item.sourceType) : stage;
                const sourceId = this.numberOrNull(item?.sourceId) ?? undefined;
                this.addDiscountSource(traceSources, {
                    label,
                    sourceType,
                    sourceId,
                    amount: Math.abs(delta),
                    scope: 'room',
                    displayInNightlyRows: false,
                    displayInSummary: true,
                    commercialLabel: label,
                    roomIndex,
                });
            });
        });

        const stayModifiers = Array.isArray(calculation?.stayModifiers) ? calculation.stayModifiers : [];
        stayModifiers.forEach((modifier: any) => {
            const amount = this.firstNumber(modifier?.amount);
            const label = String(modifier?.name ?? 'Stay discount');
            if (amount >= 0 || !this.isCommercialDiscountLabel(label)) return;
            this.addDiscountSource(sources, {
                label,
                amount: Math.abs(amount),
                scope: 'stay',
                displayInNightlyRows: false,
                displayInSummary: true,
                commercialLabel: label,
            });
        });

        traceSources.forEach((traceSource, key) => {
            const knownAmount = this.discountAmountForLabel(sources, traceSource.label);
            const residual = this.toCurrencyAmount(traceSource.amount - knownAmount);
            if (residual <= 0.005) return;
            const scope = traceSource.roomIndex != null ? 'room' : 'global';
            sources.set(`residual:${key}`, {
                ...traceSource,
                amount: residual,
                scope,
                displayInNightlyRows: false,
                displayInSummary: true,
            });
        });

        if (sources.size > 0) {
            return [...sources.values()].filter((source) => source.amount > 0);
        }

        const appliedPromotionTotal = this.discountFromAppliedModifiers(calculation);
        return appliedPromotionTotal > 0
            ? [{
                label: 'Applied promotional discounts',
                sourceType: 'applied_modifier',
                amount: appliedPromotionTotal,
                scope: 'global',
                displayInNightlyRows: false,
                displayInSummary: true,
                commercialLabel: 'Applied promotional discounts',
            }]
            : [];
    }

    private addDiscountSource(sources: Map<string, DiscountSource>, source: DiscountSource): void {
        const key = [
            source.scope,
            source.sourceType ?? '',
            source.sourceId ?? '',
            source.roomIndex ?? '',
            source.label,
            source.displayInNightlyRows ? 'row' : 'summary',
        ].join(':');
        const amount = this.toCurrencyAmount(source.amount);
        const current = sources.get(key);
        if (current) {
            current.amount = this.toCurrencyAmount(current.amount + amount);
        } else {
            sources.set(key, {
                ...source,
                amount,
                commercialLabel: source.commercialLabel || source.label,
            });
        }
    }

    private discountAmountForLabel(sources: Map<string, DiscountSource>, label: string): number {
        const normalized = this.normalizeDiscountLabel(label);
        const total = [...sources.values()].reduce((sum, source) => {
            return this.normalizeDiscountLabel(source.label) === normalized
                ? sum + source.amount
                : sum;
        }, 0);
        return this.toCurrencyAmount(total);
    }

    private normalizeDiscountLabel(label: string): string {
        return label.trim().toLowerCase().replace(/\s+/g, ' ');
    }

    private isCommercialDiscountLabel(label: string): boolean {
        const normalized = label.toLowerCase();
        return normalized.includes('spo')
            || normalized.includes('early booking')
            || normalized.includes('promotion')
            || normalized.includes('remise');
    }

    private buildProformaView(
        calculation: any,
        totalsSnapshot: Record<string, any>,
        currency: string,
        roomingSummary: any,
    ): Record<string, any> {
        const rooms = Array.isArray(calculation?.roomsBreakdown) ? calculation.roomsBreakdown : [];
        const rooming = Array.isArray(roomingSummary) ? roomingSummary : [];
        const stayModifiers = Array.isArray(calculation?.stayModifiers) ? calculation.stayModifiers : [];
        const discountSources = Array.isArray(totalsSnapshot.discountSources)
            ? totalsSnapshot.discountSources as DiscountSource[]
            : [];

        return {
            version: 1,
            currency,
            sourceCurrency: totalsSnapshot.sourceCurrency ?? currency,
            documentCurrency: totalsSnapshot.documentCurrency ?? currency,
            exchangeRateUsed: totalsSnapshot.exchangeRateUsed ?? totalsSnapshot.exchangeRate ?? null,
            fxConversionMode: totalsSnapshot.fxConversionMode ?? totalsSnapshot.exchangeRateType ?? 'identity',
            nightlyLineMode: 'commercial_pricing_basis',
            nightlyLineModeLabel: 'Nightly amounts are before stay-level discounts. Discounts are summarized below.',
            discountSemantics: DISCOUNT_SEMANTICS,
            discountPresentationRules: {
                nightly: 'Displayed on the nightly row only when the pricing engine applied the discount to that specific night.',
                room: 'Displayed in the discount summary for the room or stay; never allocated across nights for presentation.',
                stay: 'Displayed once in the discount summary; never allocated across nights for presentation.',
                global: 'Displayed once in the discount summary.',
            },
            rooms: rooms.map((room: any, index: number) => this.buildProformaViewRoom(room, index, discountSources, rooming[index])),
            stayAdjustments: stayModifiers
                .filter((modifier: any) => {
                    const amount = this.firstNumber(modifier?.amount);
                    return !(amount < 0 && this.isCommercialDiscountLabel(String(modifier?.name ?? '')));
                })
                .map((modifier: any) => ({
                name: String(modifier?.name ?? 'Adjustment'),
                amount: this.toCurrencyAmount(modifier?.amount ?? 0),
            })),
            discountSummary: discountSources.filter((source) => source.displayInSummary !== false),
            totals: {
                grossAmountBeforeDiscount: totalsSnapshot.grossAmountBeforeDiscount ?? totalsSnapshot.subtotal ?? 0,
                discountAmount: totalsSnapshot.discountAmount ?? totalsSnapshot.discountTotal ?? 0,
                netAmountBeforeTax: totalsSnapshot.netAmountBeforeTax ?? totalsSnapshot.netBeforeTax ?? 0,
                taxEnabled: totalsSnapshot.taxEnabled === true,
                taxName: totalsSnapshot.taxName ?? null,
                taxAmount: totalsSnapshot.taxAmount ?? null,
                totalAmount: totalsSnapshot.totalAmount ?? totalsSnapshot.grandTotal ?? 0,
                currency,
                sourceCurrency: totalsSnapshot.sourceCurrency ?? currency,
                documentCurrency: totalsSnapshot.documentCurrency ?? currency,
                exchangeRateUsed: totalsSnapshot.exchangeRateUsed ?? totalsSnapshot.exchangeRate ?? null,
                fxConversionMode: totalsSnapshot.fxConversionMode ?? totalsSnapshot.exchangeRateType ?? 'identity',
                fxRateDate: totalsSnapshot.fxRateDate ?? totalsSnapshot.exchangeRateDate ?? null,
            },
        };
    }

    private buildProformaViewRoom(room: any, index: number, discountSources: DiscountSource[], roomingItem: any): Record<string, any> {
        const dailyRates = Array.isArray(room?.dailyRates) ? room.dailyRates : [];
        const roomDiscountAmount = this.roomDiscountAmount(room);
        const roomNetAmountBeforeTax = this.toCurrencyAmount(this.firstNumber(room?.roomTotalNet));
        const roomGrossAmountBeforeDiscount = this.toCurrencyAmount(roomNetAmountBeforeTax + roomDiscountAmount);
        const roomIndex = this.numberOrNull(room?.roomIndex) ?? index + 1;
        const occupancy = this.roomOccupancy(roomingItem);

        return {
            roomIndex,
            roomId: room?.roomId ?? null,
            roomTypeName: room?.roomTypeName ?? null,
            occupancyApplied: occupancy.total,
            roomGrossAmountBeforeDiscount,
            roomDiscountAmount,
            roomNetAmountBeforeTax,
            discountSummary: discountSources.filter((source) => source.scope === 'room' && source.roomIndex === roomIndex),
            dailyRates: dailyRates.map((day: any) => this.buildProformaViewDailyRate(day, occupancy)),
        };
    }

    private buildProformaViewDailyRate(day: any, occupancy: { adults: number; children: number; total: number }): Record<string, any> {
        const supplementsAmount = this.sumModifiers(day?.supplementsApplied);
        const nightlyDiscountAmount = this.toCurrencyAmount(Math.max(0, -this.firstNumber(day?.promotionApplied?.amount)));
        const nightlyBasis = this.commercialNightlyBasis(day, occupancy);
        const baseNightlyAmount = nightlyBasis.amount;
        const netNightlyAmount = this.toCurrencyAmount(this.firstNumber(day?.finalDailyRate));

        return {
            date: day?.date,
            baseNightlyAmount,
            grossNightlyAmount: baseNightlyAmount,
            nightlyCommercialAmount: baseNightlyAmount,
            commercialNightlyAmount: nightlyDiscountAmount > 0 ? netNightlyAmount : baseNightlyAmount,
            nightlyUnitAmount: nightlyBasis.unitAmount,
            nightlyBasisParts: nightlyBasis.parts,
            nightlyDisplayBasis: nightlyBasis.displayBasis,
            occupancyApplied: occupancy.total,
            occupancyAdultsApplied: occupancy.adults,
            occupancyChildrenApplied: occupancy.children,
            rateMode: nightlyBasis.rateMode,
            nightlyDiscountAmount,
            displayDiscountInRow: nightlyDiscountAmount > 0,
            netNightlyAmount,
            supplementsAmount,
            isAvailable: day?.isAvailable !== false,
            notes: this.dailyCommercialNotes(day),
        };
    }

    private commercialNightlyBasis(
        day: any,
        occupancy: { adults: number; children: number; total: number },
    ): {
        amount: number;
        unitAmount: number;
        displayBasis: string;
        rateMode: 'per_person' | 'per_room';
        parts: Array<Record<string, any>>;
    } {
        const baseRate = this.numberOrNull(day?.baseRate);
        const reductions = Array.isArray(day?.reductionsApplied) ? day.reductionsApplied : [];
        const hasOccupancyAdjustments = Array.isArray(day?.reductionsApplied) && day.reductionsApplied.length > 0;
        const simpleAdultOccupancy = occupancy.adults > 0 && occupancy.children === 0;

        if (baseRate != null && simpleAdultOccupancy && !hasOccupancyAdjustments) {
            return {
                amount: this.toCurrencyAmount(baseRate * occupancy.adults),
                unitAmount: this.toCurrencyAmount(baseRate),
                displayBasis: `baseRate_x_${occupancy.adults}_adults`,
                rateMode: 'per_person',
                parts: [{
                    type: 'adult',
                    label: 'Adults',
                    unitAmount: this.toCurrencyAmount(baseRate),
                    quantity: occupancy.adults,
                    amount: this.toCurrencyAmount(baseRate * occupancy.adults),
                }],
            };
        }

        const occupiedRoomRate = this.toCurrencyAmount(this.firstNumber(day?.netRate, day?.baseRate));
        if (baseRate != null && occupancy.adults > 0) {
            const extraAdultParts = reductions
                .map((modifier: any) => {
                    const adultMatch = String(modifier?.name ?? '').match(/^Adulte\s+(\d+)/i);
                    if (!adultMatch) return null;
                    const amount = this.toCurrencyAmount(modifier?.amount ?? 0);
                    if (amount <= 0) return null;
                    const percentageOfBase = baseRate > 0 ? this.toCurrencyAmount((amount / baseRate) * 100) : null;
                    return {
                        type: 'extra_adult',
                        label: `Adulte ${adultMatch[1]}`,
                        unitAmount: amount,
                        quantity: 1,
                        amount,
                        percentageOfBase,
                        reductionPercentage: percentageOfBase != null ? this.toCurrencyAmount(100 - percentageOfBase) : null,
                    };
                })
                .filter(Boolean) as Array<Record<string, any>>;

            const baseAdultQuantity = Math.max(0, occupancy.adults - extraAdultParts.length);
            const parts: Array<Record<string, any>> = [];
            if (baseAdultQuantity > 0) {
                parts.push({
                    type: 'adult',
                    label: 'Adults',
                    unitAmount: this.toCurrencyAmount(baseRate),
                    quantity: baseAdultQuantity,
                    amount: this.toCurrencyAmount(baseRate * baseAdultQuantity),
                });
            }

            parts.push(...extraAdultParts);

            reductions.forEach((modifier: any) => {
                const childMatch = String(modifier?.name ?? '').match(/^Enfant\s+(\d+)(?:\s+\(([^)]+)\))?/i);
                if (!childMatch) return;
                const amount = this.toCurrencyAmount(modifier?.amount ?? 0);
                if (amount <= 0) return;
                parts.push({
                    type: 'child',
                    label: `Enfant ${childMatch[1]}${childMatch[2] ? ` (${childMatch[2]})` : ''}`,
                    unitAmount: amount,
                    quantity: 1,
                    amount,
                    percentageOfBase: baseRate > 0 ? this.toCurrencyAmount((amount / baseRate) * 100) : null,
                });
            });

            const knownAmount = this.toCurrencyAmount(parts.reduce((sum, part) => sum + this.firstNumber(part.amount), 0));
            const residual = this.toCurrencyAmount(occupiedRoomRate - knownAmount);
            if (Math.abs(residual) > 0.005) {
                parts.push({
                    type: 'adjustment',
                    label: 'Occupancy adjustment',
                    unitAmount: residual,
                    quantity: 1,
                    amount: residual,
                });
            }

            return {
                amount: occupiedRoomRate,
                unitAmount: this.toCurrencyAmount(baseRate),
                displayBasis: 'baseRate_with_occupancy_adjustments',
                rateMode: 'per_person',
                parts,
            };
        }

        return {
            amount: occupiedRoomRate,
            unitAmount: occupiedRoomRate,
            displayBasis: 'pricing_engine_occupied_room_rate',
            rateMode: 'per_room',
            parts: [{
                type: 'room',
                label: 'Room',
                unitAmount: occupiedRoomRate,
                quantity: 1,
                amount: occupiedRoomRate,
            }],
        };
    }

    private roomOccupancy(roomingItem: any): { adults: number; children: number; total: number } {
        const adults = Math.max(0, this.firstNumber(roomingItem?.adults));
        const children = Math.max(0, this.firstNumber(roomingItem?.children));
        const total = adults + children;
        return {
            adults,
            children,
            total: total > 0 ? total : 1,
        };
    }

    private dailyCommercialNotes(day: any): string[] {
        const notes: string[] = [];
        if (Array.isArray(day?.reductionsApplied) && day.reductionsApplied.length > 0) {
            notes.push(...day.reductionsApplied.map((modifier: any) => String(modifier?.name ?? 'Reduction')));
        }
        if (day?.promotionApplied) {
            notes.push(String(day.promotionApplied.name ?? 'Promotion'));
        }
        if (Array.isArray(day?.supplementsApplied) && day.supplementsApplied.length > 0) {
            notes.push(...day.supplementsApplied.map((modifier: any) => String(modifier?.name ?? 'Supplement')));
        }
        if (day?.isAvailable === false) {
            notes.push(`Unavailable: ${day?.reason ?? 'N/A'}`);
        }
        return notes;
    }

    private roomDiscountAmount(room: any): number {
        const trace = Array.isArray(room?.pricingTrace) ? room.pricingTrace : [];
        const traceDiscount = trace.reduce((sum: number, item: any) => {
            const stage = String(item?.stage ?? '').toLowerCase();
            const delta = this.firstNumber(item?.deltaAmount);
            return (stage === 'spo' || stage === 'early_booking' || stage === 'email_spo') && delta < 0
                ? sum + Math.abs(delta)
                : sum;
        }, 0);
        if (traceDiscount > 0) return this.toCurrencyAmount(traceDiscount);

        const dailyRates = Array.isArray(room?.dailyRates) ? room.dailyRates : [];
        const dailyDiscount = dailyRates.reduce((sum: number, day: any) => {
            const amount = this.firstNumber(day?.promotionApplied?.amount);
            return amount < 0 ? sum + Math.abs(amount) : sum;
        }, 0);
        return this.toCurrencyAmount(dailyDiscount);
    }

    private sumModifiers(modifiers: any): number {
        if (!Array.isArray(modifiers)) return 0;
        return this.toCurrencyAmount(modifiers.reduce((sum: number, modifier: any) => sum + this.firstNumber(modifier?.amount), 0));
    }

    private hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
        return Object.prototype.hasOwnProperty.call(value, key);
    }

    private deepClone<T>(value: T): T {
        if (value == null) return value;
        return JSON.parse(JSON.stringify(value));
    }

    private normalizeThemeColor(value?: string | null): string | null {
        if (!value) {
            return null;
        }

        const trimmed = value.trim();
        return HEX_COLOR_PATTERN.test(trimmed) ? trimmed.toUpperCase() : null;
    }

    /**
     * Generate a unique PF-YYYY-NNNN reference using a dedicated sequence table
     * with a serializable transaction to prevent duplicates under concurrency.
     */
    private async generateReference(hotelId: number): Promise<string> {
        const year = new Date().getFullYear();

        return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
            const seqRepo = manager.getRepository(ProformaSequence);

            // Try to find existing sequence row for this hotel+year
            let seq = await seqRepo.findOne({
                where: { hotelId, year },
            });

            if (!seq) {
                // First proforma of the year for this hotel
                seq = seqRepo.create({ hotelId, year, lastSequence: 0 });
            }

            seq.lastSequence += 1;
            await seqRepo.save(seq);

            return `PF-${year}-${String(seq.lastSequence).padStart(4, '0')}`;
        });
    }

    private buildDocumentSnapshot(proforma: ProformaInvoice): ProformaDocumentSnapshot {
        return {
            hotel: {
                id: proforma.hotel?.id ?? proforma.hotelId ?? null,
                name: proforma.hotel?.name ?? null,
                reference: proforma.hotel?.reference ?? null,
                address: proforma.hotel?.address ?? null,
                phone: proforma.hotel?.phone ?? null,
                emails: Array.isArray(proforma.hotel?.emails) ? this.deepClone(proforma.hotel.emails) : [],
                logoUrl: proforma.hotel?.logoUrl ?? proforma.documentLogoUrl ?? null,
                themeColor: this.normalizeThemeColor(proforma.hotel?.preferredThemeColor ?? proforma.documentThemeColor) ?? null,
            },
            affiliate: proforma.affiliateId ? {
                id: proforma.affiliate?.id ?? proforma.affiliateId ?? null,
                companyName: proforma.affiliate?.companyName ?? proforma.customerName ?? null,
                reference: proforma.affiliate?.reference ?? null,
                address: proforma.affiliate?.address ?? null,
                emails: Array.isArray(proforma.affiliate?.emails) ? this.deepClone(proforma.affiliate.emails) : [],
            } : null,
        };
    }

    private async buildDownloadResult(
        proforma: ProformaInvoice,
        language: string | undefined,
        issuedNow: boolean,
    ): Promise<ProformaDownloadResult> {
        const buffer = await this.pdfService.generate(proforma, { language });
        return {
            proforma,
            filename: `${proforma.reference}.pdf`,
            buffer,
            issuedNow,
        };
    }

    private assertDraftEditable(proforma: ProformaInvoice): void {
        if (proforma.status !== ProformaInvoiceStatus.DRAFT) {
            throw new BadRequestException('Issued invoices are immutable and cannot be edited from the preview workspace.');
        }
    }

    private assertPreviewSettingsEditable(proforma: ProformaInvoice): void {
        if (
            proforma.status !== ProformaInvoiceStatus.DRAFT
            && !this.isIssuedLikeStatus(proforma.status)
        ) {
            throw new BadRequestException('This proforma cannot be edited from the preview workspace.');
        }
    }

    private isIssuedLikeStatus(status?: ProformaInvoiceStatus | null): boolean {
        return status === ProformaInvoiceStatus.ISSUED || status === ProformaInvoiceStatus.GENERATED;
    }

    private async loadRequiredProforma(hotelId: number, id: number): Promise<ProformaInvoice> {
        const proforma = await this.findOne(hotelId, id);
        if (!proforma) {
            throw new NotFoundException(`Proforma #${id} not found`);
        }
        return proforma;
    }

    private loadProforma(hotelId: number, id: number): Promise<ProformaInvoice | null> {
        return this.proformaRepo.findOne({
            where: { id, hotelId },
            relations: ['hotel', 'affiliate'],
        });
    }

    private generateDraftReference(hotelId: number): string {
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const entropy = randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
        return `PFD-${hotelId}-${stamp}-${entropy}`;
    }
}
