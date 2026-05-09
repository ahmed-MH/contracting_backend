import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProformaInvoiceStatus } from '../../common/constants/enums';
import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { ProformaSequence } from './entities/proforma-sequence.entity';
import { ProformaPdfService } from './proforma-pdf.service';
import { ProformaService } from './proforma.service';
import { Hotel } from '../hotel/entities/hotel.entity';
import { CurrencyConversionService } from '../exchange-rates/currency-conversion.service';
import { AuditService } from '../../common/audit/audit.service';

describe('ProformaService', () => {
    let service: ProformaService;

    const proformaRepo = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
    };
    const sequenceRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
    };
    const hotelRepo = {
        findOne: jest.fn(),
    };
    const dataSource = {
        transaction: jest.fn(),
    };
    const currencyConversion = {
        resolveRate: jest.fn(),
        convertAmount: jest.fn(),
    };
    const auditService = {
        resolveActor: jest.fn(async (currentUser?: { id?: number; email?: string | null; displayName?: string | null }) => ({
            userId: currentUser?.id ?? null,
            name: currentUser?.displayName ?? currentUser?.email ?? (currentUser?.id ? `User #${currentUser.id}` : 'System'),
            email: currentUser?.email ?? null,
        })),
        systemActor: jest.fn(() => ({
            userId: null,
            name: 'System',
            email: null,
        })),
        applyCreateAudit: jest.fn((entity: any, actor: any, timestamp: Date = new Date()) => {
            entity.createdAt = timestamp;
            entity.updatedAt = timestamp;
            entity.createdByUserId = actor.userId;
            entity.createdByName = actor.name;
            entity.createdByEmail = actor.email;
            entity.updatedByUserId = actor.userId;
            entity.updatedByName = actor.name;
            entity.updatedByEmail = actor.email;
            return entity;
        }),
        applyUpdateAudit: jest.fn((entity: any, actor: any, timestamp: Date = new Date()) => {
            entity.updatedAt = timestamp;
            entity.updatedByUserId = actor.userId;
            entity.updatedByName = actor.name;
            entity.updatedByEmail = actor.email;
            return entity;
        }),
    };
    const pdfService = {
        generate: jest.fn(async () => Buffer.from('pdf')),
    };
    const currentUser = {
        id: 7,
        email: 'seller@pricify.local',
        displayName: 'Commercial Seller',
        role: 'ADMIN',
        hotelIds: [3],
        tenantId: 1,
    } as any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProformaService,
                { provide: getRepositoryToken(ProformaInvoice), useValue: proformaRepo },
                { provide: getRepositoryToken(ProformaSequence), useValue: sequenceRepo },
                { provide: getRepositoryToken(Hotel), useValue: hotelRepo },
                { provide: DataSource, useValue: dataSource },
                { provide: CurrencyConversionService, useValue: currencyConversion },
                { provide: AuditService, useValue: auditService },
                { provide: ProformaPdfService, useValue: pdfService },
            ],
        }).compile();

        service = module.get(ProformaService);
        jest.clearAllMocks();

        sequenceRepo.findOne.mockResolvedValue(null);
        sequenceRepo.create.mockImplementation((value) => value);
        sequenceRepo.save.mockImplementation(async (value) => value);
        dataSource.transaction.mockImplementation(async (_level: string, callback: any) => callback({
            getRepository: () => sequenceRepo,
        }));
        hotelRepo.findOne.mockResolvedValue({
            id: 3,
            logoUrl: 'data:image/png;base64,abc',
            preferredThemeColor: '#1A2B3C',
        });
        proformaRepo.create.mockImplementation((value) => value);
        proformaRepo.save.mockImplementation(async (value) => value);
        currencyConversion.resolveRate.mockResolvedValue({
            hotelId: 3,
            sourceCurrency: 'EUR',
            targetCurrency: 'EUR',
            type: 'identity',
            rate: 1,
            rateDate: '2026-01-15',
            pairsUsed: [],
        });
        currencyConversion.convertAmount.mockResolvedValue({
            hotelId: 3,
            sourceCurrency: 'EUR',
            targetCurrency: 'EUR',
            type: 'identity',
            rate: 1,
            rateDate: '2026-01-15',
            pairsUsed: [],
            amount: 0,
            convertedAmount: 0,
        });
    });

    it('stores inactive-contract override metadata in simulation and calculation snapshots', async () => {
        const dto = {
            affiliateId: 10,
            contractId: 55,
            customerName: 'Partner A',
            customerEmail: 'partner@example.com',
            checkIn: '2026-06-01',
            checkOut: '2026-06-05',
            bookingDate: '2026-01-15',
            voucherNumber: ' RES-2026-0015 ',
            boardTypeName: 'Half Board',
            currency: 'EUR',
            roomingSummary: [{ roomTypeName: 'Standard Room' }],
            simulationInput: {
                contractId: 55,
                includeInactive: true,
                inactiveOverrideReason: 'Commercial comparison',
                contractOverrideContext: {
                    contractStatus: 'EXPIRED',
                    includeInactive: true,
                    overrideReason: 'Commercial comparison',
                },
            },
            calculationResult: {
                contractId: 55,
                contractStatus: 'EXPIRED',
                inactiveContractOverride: {
                    enabled: true,
                    contractStatus: 'EXPIRED',
                    reason: 'Commercial comparison',
                },
            },
            totals: {
                subtotal: 1000,
                discountTotal: 150,
                grandTotal: 850,
            },
            notes: 'Snapshot test',
        };

        const result = await service.create(3, currentUser, dto as any);

        expect(proformaRepo.create).toHaveBeenCalledWith(expect.objectContaining({
            hotelId: 3,
            generatedByUserId: 7,
            status: ProformaInvoiceStatus.DRAFT,
            simulationInputSnapshot: expect.objectContaining({
                includeInactive: true,
                inactiveOverrideReason: 'Commercial comparison',
                contractOverrideContext: expect.objectContaining({
                    contractStatus: 'EXPIRED',
                    includeInactive: true,
                    overrideReason: 'Commercial comparison',
                }),
            }),
            calculationSnapshot: expect.objectContaining({
                contractStatus: 'EXPIRED',
                inactiveContractOverride: {
                    enabled: true,
                    contractStatus: 'EXPIRED',
                    reason: 'Commercial comparison',
                },
            }),
            documentLogoUrl: 'data:image/png;base64,abc',
            documentThemeColor: '#1A2B3C',
            voucherNumber: 'RES-2026-0015',
        }));
        expect(result.simulationInputSnapshot.contractOverrideContext.contractStatus).toBe('EXPIRED');
        expect(result.calculationSnapshot.inactiveContractOverride.reason).toBe('Commercial comparison');
    });

    it('normalizes tax settings and stores backend-calculated document totals', async () => {
        const result = await service.create(3, currentUser, {
            affiliateId: 10,
            contractId: 55,
            customerName: 'Partner A',
            checkIn: '2026-06-01',
            checkOut: '2026-06-05',
            bookingDate: '2026-01-15',
            boardTypeName: 'Half Board',
            currency: 'eur',
            taxEnabled: true,
            taxAmount: 19.995,
            roomingSummary: [],
            simulationInput: {},
            calculationResult: {
                totalBrut: 1000,
                totalRemise: 150,
                totalNet: 850,
            },
            totals: {
                subtotal: 999999,
                discountTotal: 999999,
                grandTotal: 999999,
            },
        } as any);

        expect(result.currency).toBe('EUR');
        expect(result.taxEnabled).toBe(true);
        expect(result.taxAmount).toBe(20);
        expect(result.totalsSnapshot).toEqual(expect.objectContaining({
            grossAmountBeforeDiscount: 1000,
            subtotal: 1000,
            discountAmount: 150,
            discountTotal: 150,
            netBeforeTax: 850,
            netAmountBeforeTax: 850,
            taxEnabled: true,
            taxName: 'VAT / tax',
            taxAmount: 20,
            taxCurrency: 'EUR',
            grandTotal: 870,
            totalAmount: 870,
            sourceCurrency: 'EUR',
            documentCurrency: 'EUR',
            exchangeRate: 1,
            exchangeRateUsed: 1,
            exchangeRateDate: expect.any(String),
            fxRateDate: expect.any(String),
            exchangeRatePivotCurrency: null,
            exchangeRateType: 'identity',
            fxConversionMode: 'identity',
            discountSources: [],
            pricingLineMode: 'semantic_discount_summary',
        }));
        expect(result.calculationSnapshot.proformaView).toEqual(expect.objectContaining({
            version: 1,
            currency: 'EUR',
            nightlyLineMode: 'commercial_pricing_basis',
            totals: expect.objectContaining({
                grossAmountBeforeDiscount: 1000,
                discountAmount: 150,
                netAmountBeforeTax: 850,
                taxName: 'VAT / tax',
                taxAmount: 20,
                totalAmount: 870,
            }),
        }));
    });

    it('derives proforma discount from pricing trace when legacy totalRemise is zero', async () => {
        const result = await service.create(3, currentUser, {
            affiliateId: 10,
            contractId: 55,
            customerName: 'Partner A',
            checkIn: '2026-06-01',
            checkOut: '2026-06-05',
            bookingDate: '2026-01-15',
            boardTypeName: 'Half Board',
            currency: 'EUR',
            roomingSummary: [],
            simulationInput: {},
            calculationResult: {
                totalBrut: 1000,
                totalRemise: 0,
                totalNet: 880,
                roomsBreakdown: [{
                    pricingTrace: [
                        { stage: 'spo', deltaAmount: -75 },
                        { stage: 'early_booking', deltaAmount: -45 },
                    ],
                }],
            },
            totals: {
                subtotal: 1000,
                discountTotal: 0,
                grandTotal: 880,
            },
        } as any);

        expect(result.totalsSnapshot.discountAmount).toBe(120);
        expect(result.totalsSnapshot.discountTotal).toBe(120);
        expect(result.totalsSnapshot.subtotal).toBe(1000);
        expect(result.totalsSnapshot.netBeforeTax).toBe(880);
    });

    it('keeps Email SPO distinct in the proforma discount summary', async () => {
        const result = await service.create(3, currentUser, {
            affiliateId: 10,
            contractId: 55,
            customerName: 'Partner A',
            checkIn: '2026-06-01',
            checkOut: '2026-06-05',
            bookingDate: '2026-01-15',
            boardTypeName: 'Half Board',
            currency: 'EUR',
            roomingSummary: [],
            simulationInput: {},
            calculationResult: {
                totalBrut: 1000,
                totalRemise: 0,
                totalNet: 855,
                roomsBreakdown: [{
                    pricingTrace: [
                        { stage: 'spo', label: 'SPO Summer', deltaAmount: -95, sourceType: 'SPO', sourceId: 11 },
                        {
                            stage: 'email_spo',
                            label: 'Email SPO (Portugal Flash Offer)',
                            deltaAmount: -50,
                            sourceType: 'EMAIL_SPO',
                            sourceId: 91,
                            type: 'EMAIL_SPO',
                            percent: 5,
                            stackMode: 'ROLLING',
                            applicationStep: 'AFTER_EARLY_BOOKING',
                            baseAmount: 1000,
                            discountAmount: 50,
                        },
                    ],
                }],
            },
            totals: {
                subtotal: 1000,
                discountTotal: 0,
                grandTotal: 855,
            },
        } as any);

        expect(result.totalsSnapshot.discountAmount).toBe(145);
        expect(result.totalsSnapshot.discountSources).toEqual(expect.arrayContaining([
            expect.objectContaining({
                label: 'SPO Summer',
                sourceType: 'SPO',
                amount: 95,
            }),
            expect.objectContaining({
                label: 'Email SPO (Portugal Flash Offer)',
                sourceType: 'EMAIL_SPO',
                amount: 50,
            }),
        ]));
    });

    it('uses the commercial room pricing basis for nightly proforma display', async () => {
        const dailyRates = Array.from({ length: 10 }, (_unused, index) => ({
            date: `2026-06-${String(index + 1).padStart(2, '0')}`,
            baseRate: 81,
            netRate: 207.36,
            finalDailyRate: 116.64,
            currency: 'EUR',
            promotionApplied: null,
            reductionsApplied: [],
            supplementsApplied: [],
        }));

        const result = await service.create(3, currentUser, {
            affiliateId: 10,
            contractId: 55,
            customerName: 'Partner A',
            checkIn: '2026-06-01',
            checkOut: '2026-06-11',
            bookingDate: '2026-01-15',
            boardTypeName: 'Half Board',
            currency: 'EUR',
            roomingSummary: [{ roomTypeName: 'Standard Room', adults: 2, children: 0 }],
            simulationInput: {},
            calculationResult: {
                totalBrut: 1620,
                totalRemise: 453.6,
                totalNet: 1166.4,
                roomsBreakdown: [{
                    roomIndex: 1,
                    roomTotalNet: 1166.4,
                    dailyRates,
                    pricingTrace: [
                        { stage: 'spo', label: 'Long Stay / SPO', deltaAmount: -162 },
                        { stage: 'early_booking', label: 'Early Booking', deltaAmount: -291.6 },
                    ],
                }],
            },
            totals: {
                subtotal: 1620,
                discountTotal: 453.6,
                grandTotal: 1166.4,
            },
        } as any);

        expect(result.totalsSnapshot).toEqual(expect.objectContaining({
            grossAmountBeforeDiscount: 1620,
            discountAmount: 453.6,
            netAmountBeforeTax: 1166.4,
            grandTotal: 1166.4,
        }));
        expect(result.calculationSnapshot.proformaView.rooms[0].dailyRates[0]).toEqual(expect.objectContaining({
            nightlyCommercialAmount: 162,
            baseNightlyAmount: 162,
            grossNightlyAmount: 162,
            commercialNightlyAmount: 162,
            netNightlyAmount: 116.64,
            displayDiscountInRow: false,
            nightlyDisplayBasis: 'baseRate_x_2_adults',
            nightlyUnitAmount: 81,
            occupancyApplied: 2,
            occupancyAdultsApplied: 2,
            occupancyChildrenApplied: 0,
            rateMode: 'per_person',
        }));
        expect(result.calculationSnapshot.proformaView.discountSummary).toEqual([
            expect.objectContaining({
                commercialLabel: 'Long Stay / SPO',
                amount: 162,
                displayInNightlyRows: false,
                displayInSummary: true,
            }),
            expect.objectContaining({
                commercialLabel: 'Early Booking',
                amount: 291.6,
                displayInNightlyRows: false,
                displayInSummary: true,
            }),
        ]);
    });

    it('upgrades stale stored proforma snapshots on read', async () => {
        const stale: any = {
            id: 10,
            hotelId: 3,
            affiliateId: 10,
            contractId: 55,
            status: ProformaInvoiceStatus.DRAFT,
            currency: 'EUR',
            taxEnabled: false,
            taxAmount: null,
            customerName: 'Solfira',
            checkIn: '2025-10-01',
            checkOut: '2025-10-11',
            bookingDate: '2026-04-20',
            boardTypeName: 'All Inclusive',
            roomingSummary: [{ roomTypeName: 'Std City View Room', adults: 2, children: 0 }],
            simulationInputSnapshot: {},
            calculationSnapshot: {
                totalNet: 1166.4,
                proformaView: {
                    nightlyLineMode: 'commercial_nightly_rate',
                    rooms: [{
                        dailyRates: [{ date: '2025-10-01', baseNightlyAmount: 207.36 }],
                    }],
                },
                roomsBreakdown: [{
                    roomIndex: 1,
                    roomTotalNet: 1166.4,
                    dailyRates: [{
                        date: '2025-10-01',
                        baseRate: 81,
                        netRate: 207.36,
                        finalDailyRate: 116.64,
                        promotionApplied: null,
                        reductionsApplied: [],
                        supplementsApplied: [],
                    }],
                    pricingTrace: [
                        { stage: 'spo', label: 'SPO Long Stay', deltaAmount: -162 },
                        { stage: 'early_booking', label: 'Early Booking', deltaAmount: -291.6 },
                    ],
                }],
            },
            totalsSnapshot: {
                subtotal: 1620,
                discountTotal: 453.6,
                grandTotal: 1166.4,
                sourceCurrency: 'EUR',
                documentCurrency: 'EUR',
                exchangeRate: 1,
                exchangeRateType: 'identity',
            },
            notes: null,
        };

        proformaRepo.findOne.mockResolvedValue(stale);

        const result = await service.findOne(3, 10);

        expect(proformaRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            id: 10,
            calculationSnapshot: expect.objectContaining({
                proformaView: expect.objectContaining({
                    nightlyLineMode: 'commercial_pricing_basis',
                    rooms: [expect.objectContaining({
                        dailyRates: [expect.objectContaining({
                            nightlyCommercialAmount: 162,
                            nightlyUnitAmount: 81,
                            baseNightlyAmount: 162,
                            commercialNightlyAmount: 162,
                            occupancyAdultsApplied: 2,
                        })],
                    })],
                }),
            }),
        }));
        expect(result.calculationSnapshot.proformaView.rooms[0].dailyRates[0].nightlyCommercialAmount).toBe(162);
        expect(result.calculationSnapshot.proformaView.rooms[0].dailyRates[0].nightlyUnitAmount).toBe(81);
    });

    it('exposes child-reduction pricing basis parts for commercial nightly display', async () => {
        const result = await service.create(3, currentUser, {
            affiliateId: 10,
            contractId: 55,
            customerName: 'Partner A',
            checkIn: '2025-10-01',
            checkOut: '2025-10-05',
            bookingDate: '2026-01-15',
            boardTypeName: 'All Inclusive',
            currency: 'EUR',
            roomingSummary: [{ roomTypeName: 'Double Room', adults: 2, children: 1 }],
            simulationInput: {},
            calculationResult: {
                totalBrut: 810,
                totalRemise: 0,
                totalNet: 810,
                roomsBreakdown: [{
                    roomIndex: 1,
                    roomTotalNet: 810,
                    dailyRates: [{
                        date: '2025-10-01',
                        baseRate: 81,
                        netRate: 202.5,
                        finalDailyRate: 202.5,
                        currency: 'EUR',
                        promotionApplied: null,
                        reductionsApplied: [{ name: 'Enfant 1 (5 ans)', amount: 40.5 }],
                        supplementsApplied: [],
                    }],
                    pricingTrace: [],
                }],
            },
            totals: {
                subtotal: 810,
                discountTotal: 0,
                grandTotal: 810,
            },
        } as any);

        const day = result.calculationSnapshot.proformaView.rooms[0].dailyRates[0];
        expect(day).toEqual(expect.objectContaining({
            nightlyCommercialAmount: 202.5,
            nightlyUnitAmount: 81,
            nightlyDisplayBasis: 'baseRate_with_occupancy_adjustments',
            rateMode: 'per_person',
            occupancyAdultsApplied: 2,
            occupancyChildrenApplied: 1,
        }));
        expect(day.nightlyBasisParts).toEqual([
            expect.objectContaining({
                type: 'adult',
                unitAmount: 81,
                quantity: 2,
                amount: 162,
            }),
            expect.objectContaining({
                type: 'child',
                label: 'Enfant 1 (5 ans)',
                unitAmount: 40.5,
                quantity: 1,
                amount: 40.5,
                percentageOfBase: 50,
            }),
        ]);
    });

    it('exposes extra-adult reduction pricing basis parts without technical residuals', async () => {
        const result = await service.create(3, currentUser, {
            affiliateId: 10,
            contractId: 55,
            customerName: 'Partner A',
            checkIn: '2025-10-01',
            checkOut: '2025-10-02',
            bookingDate: '2026-01-15',
            boardTypeName: 'All Inclusive',
            currency: 'EUR',
            roomingSummary: [{ roomTypeName: 'Double Room', adults: 3, children: 0 }],
            simulationInput: {},
            calculationResult: {
                totalBrut: 218.7,
                totalRemise: 0,
                totalNet: 218.7,
                roomsBreakdown: [{
                    roomIndex: 1,
                    roomTotalNet: 218.7,
                    dailyRates: [{
                        date: '2025-10-01',
                        baseRate: 81,
                        netRate: 218.7,
                        finalDailyRate: 218.7,
                        currency: 'EUR',
                        promotionApplied: null,
                        reductionsApplied: [{ name: 'Adulte 3 Suppl.', amount: 56.7 }],
                        supplementsApplied: [],
                    }],
                    pricingTrace: [],
                }],
            },
            totals: {
                subtotal: 218.7,
                discountTotal: 0,
                grandTotal: 218.7,
            },
        } as any);

        const day = result.calculationSnapshot.proformaView.rooms[0].dailyRates[0];
        expect(day).toEqual(expect.objectContaining({
            nightlyCommercialAmount: 218.7,
            nightlyUnitAmount: 81,
            nightlyDisplayBasis: 'baseRate_with_occupancy_adjustments',
            rateMode: 'per_person',
            occupancyAdultsApplied: 3,
        }));
        expect(day.nightlyBasisParts).toEqual([
            expect.objectContaining({
                type: 'adult',
                unitAmount: 81,
                quantity: 2,
                amount: 162,
            }),
            expect.objectContaining({
                type: 'extra_adult',
                label: 'Adulte 3',
                unitAmount: 56.7,
                quantity: 1,
                amount: 56.7,
                percentageOfBase: 70,
                reductionPercentage: 30,
            }),
        ]);
    });

    it('updates preview currency and tax through backend conversion', async () => {
        const saved: any = {
            id: 99,
            hotelId: 3,
            affiliateId: 10,
            contractId: 55,
            status: ProformaInvoiceStatus.DRAFT,
            currency: 'EUR',
            taxEnabled: true,
            taxAmount: 10,
            bookingDate: '2026-01-15',
            calculationSnapshot: {
                totalNet: 900,
                roomsBreakdown: [{
                    roomTotalNet: 900,
                    dailyRates: [{ baseRate: 500, netRate: 500, finalDailyRate: 450, currency: 'EUR' }],
                    pricingTrace: [{ stage: 'spo', deltaAmount: -100 }],
                }],
            },
            totalsSnapshot: {
                sourceCurrency: 'EUR',
                subtotal: 1000,
                discountTotal: 100,
                taxAmount: 10,
                grandTotal: 910,
            },
            notes: null,
            voucherNumber: null,
        };
        proformaRepo.findOne.mockResolvedValueOnce(saved).mockResolvedValueOnce({
            ...saved,
            currency: 'USD',
        });
        currencyConversion.resolveRate.mockResolvedValue({
            hotelId: 3,
            sourceCurrency: 'EUR',
            targetCurrency: 'USD',
            type: 'direct',
            rate: 1.2,
            rateDate: '2026-01-15',
            pairsUsed: [],
        });
        currencyConversion.convertAmount.mockResolvedValue({
            hotelId: 3,
            sourceCurrency: 'EUR',
            targetCurrency: 'USD',
            type: 'direct',
            rate: 1.2,
            rateDate: '2026-01-15',
            pairsUsed: [],
            amount: 10,
            convertedAmount: 12,
        });

        await service.updatePreviewSettings(3, 99, { currency: 'USD', voucherNumber: ' VCH-99 ' });

        expect(proformaRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            currency: 'USD',
            taxAmount: 12,
            voucherNumber: 'VCH-99',
            totalsSnapshot: expect.objectContaining({
                documentCurrency: 'USD',
                exchangeRate: 1.2,
                discountAmount: 120,
                netBeforeTax: 1080,
                grandTotal: 1092,
            }),
            calculationSnapshot: expect.objectContaining({
                totalNet: 1080,
                roomsBreakdown: [expect.objectContaining({
                    roomTotalNet: 1080,
                })],
                proformaView: expect.objectContaining({
                    currency: 'USD',
                    sourceCurrency: 'EUR',
                    documentCurrency: 'USD',
                    exchangeRateUsed: 1.2,
                    rooms: [expect.objectContaining({
                        roomGrossAmountBeforeDiscount: 1200,
                        roomDiscountAmount: 120,
                        roomNetAmountBeforeTax: 1080,
                        dailyRates: [expect.objectContaining({
                            baseNightlyAmount: 600,
                            grossNightlyAmount: 600,
                            nightlyCommercialAmount: 600,
                            commercialNightlyAmount: 600,
                            displayDiscountInRow: false,
                            nightlyDiscountAmount: 0,
                            netNightlyAmount: 540,
                        })],
                    })],
                    discountSummary: [expect.objectContaining({
                        label: 'SPO',
                        amount: 120,
                        scope: 'global',
                        displayInNightlyRows: false,
                        displayInSummary: true,
                    })],
                    totals: expect.objectContaining({
                        discountAmount: 120,
                        netAmountBeforeTax: 1080,
                        taxAmount: 12,
                        totalAmount: 1092,
                    }),
                }),
            }),
        }));
    });

    it('allows issued invoices to update final preview settings', async () => {
        const saved: any = {
            id: 100,
            hotelId: 3,
            affiliateId: 10,
            contractId: 55,
            status: ProformaInvoiceStatus.ISSUED,
            reference: 'PF-2026-0001',
            currency: 'EUR',
            taxEnabled: false,
            taxAmount: null,
            bookingDate: '2026-01-15',
            calculationSnapshot: {
                totalNet: 900,
                roomsBreakdown: [{
                    roomTotalNet: 900,
                    dailyRates: [{ baseRate: 500, netRate: 500, finalDailyRate: 450, currency: 'EUR' }],
                }],
            },
            totalsSnapshot: {
                sourceCurrency: 'EUR',
                subtotal: 900,
                discountTotal: 0,
                grandTotal: 900,
            },
            notes: 'Old notes',
            voucherNumber: 'OLD-VCH',
            roomingSummary: [],
        };
        proformaRepo.findOne.mockResolvedValueOnce(saved).mockResolvedValueOnce({
            ...saved,
            notes: 'Updated notes',
            voucherNumber: 'NEW-VCH',
        });

        await service.updatePreviewSettings(3, 100, {
            notes: 'Updated notes',
            voucherNumber: ' NEW-VCH ',
        }, currentUser);

        expect(proformaRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            status: ProformaInvoiceStatus.ISSUED,
            reference: 'PF-2026-0001',
            notes: 'Updated notes',
            voucherNumber: 'NEW-VCH',
        }));
    });
});
