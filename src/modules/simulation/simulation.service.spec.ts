import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SimulationService } from './simulation.service';
import { PricingEngineService } from './pricing-engine.service';
import { Contract } from '../contract/core/entities/contract.entity';
import { ContractLine } from '../contract/core/entities/contract-line.entity';
import { ContractReduction } from '../contract/reduction/entities/contract-reduction.entity';
import { ContractMonoparentalRule } from '../contract/monoparental/entities/contract-monoparental-rule.entity';
import { ContractEarlyBooking } from '../contract/early-booking/entities/contract-early-booking.entity';
import { ContractSpo } from '../contract/spo/entities/contract-spo.entity';
import { ContractSupplement } from '../contract/supplement/entities/contract-supplement.entity';
import { AffiliateEmailSpo } from '../affiliate/email-spo/entities/affiliate-email-spo.entity';
import { OccupantType } from './dto/simulation-request.dto';
import { SimulationContractMatcherService } from './simulation-contract-matcher.service';
import { 
    AffiliateEmailSpoApplicationStep,
    AffiliateEmailSpoStackMode,
    AffiliateEmailSpoStatus,
    ContractStatus, 
    ReductionCalculationType, 
    SupplementSystemCode, 
    ReductionSystemCode, 
    PricingModifierApplicationType, 
    BaseRateType, 
    ChildSurchargeBase,
    SpoBenefitType,
    SpoConditionType,
    SupplementCalculationType
} from '../../common/constants/enums';

describe('SimulationService - Démo Commerciale (Moteur de Tarification)', () => {
    let service: SimulationService;

    // Separate mock repos
    const repos = {
        contract: { findOne: jest.fn(), find: jest.fn() },
        line: { find: jest.fn() },
        reduction: { find: jest.fn() },
        monoparental: { find: jest.fn() },
        earlyBooking: { find: jest.fn() },
        spo: { find: jest.fn() },
        supplement: { find: jest.fn() },
        affiliateEmailSpo: { findOne: jest.fn() },
    };
    const contractMatcher = {
        assertContractMatches: jest.fn(),
    };

    const mockContract = {
        id: 1,
        status: ContractStatus.ACTIVE,
        currency: 'TND',
        baseArrangementId: 1,
        periods: [{ id: 1, startDate: '2025-01-01', endDate: '2025-12-31' }],
    };

    const mockRoom = { id: 1, roomType: { id: 1, name: 'Standard Room' } };
    const mockArrangementRO = { id: 1, name: 'Room Only' };

    const mockPrice = {
        amount: 100,
        arrangement: mockArrangementRO,
    };

    const mockLine = {
        id: 1,
        isContracted: true,
        period: mockContract.periods[0],
        contractRoom: mockRoom,
        prices: [mockPrice],
    };

    const createRule = (overrides = {}) => ({
        applicableContractRooms: [],
        applicablePeriods: [],
        applicableArrangements: [],
        ...overrides
    });

    const createEmailSpo = (overrides = {}) => ({
        id: 91,
        hotelId: 1,
        affiliateId: 10,
        name: 'Solferias June',
        discountPercent: 5,
        applicationFrom: '2025-06-01',
        applicationTo: '2025-06-30',
        stackMode: AffiliateEmailSpoStackMode.ROLLING,
        applicationStep: AffiliateEmailSpoApplicationStep.AFTER_CONTRACT_SPO,
        status: AffiliateEmailSpoStatus.ACTIVE,
        ...overrides,
    });

    const createRoomingList = (roomId: number, adults: number, childrenAges: number[] = []) => {
        const occupants: any[] = [];
        let paxOrder = 1;
        for (let i = 0; i < adults; i++) {
            occupants.push({ paxOrder: paxOrder++, type: OccupantType.ADULT, age: 30 });
        }
        childrenAges.forEach(age => {
            occupants.push({ paxOrder: paxOrder++, type: OccupantType.CHILD, age });
        });
        return [{ roomId, occupants }];
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SimulationService,
                PricingEngineService,
                { provide: getRepositoryToken(Contract), useValue: repos.contract },
                { provide: getRepositoryToken(ContractLine), useValue: repos.line },
                { provide: getRepositoryToken(ContractReduction), useValue: repos.reduction },
                { provide: getRepositoryToken(ContractMonoparentalRule), useValue: repos.monoparental },
                { provide: getRepositoryToken(ContractEarlyBooking), useValue: repos.earlyBooking },
                { provide: getRepositoryToken(ContractSpo), useValue: repos.spo },
                { provide: getRepositoryToken(ContractSupplement), useValue: repos.supplement },
                { provide: getRepositoryToken(AffiliateEmailSpo), useValue: repos.affiliateEmailSpo },
                { provide: SimulationContractMatcherService, useValue: contractMatcher },
            ],
        }).compile();

        service = module.get<SimulationService>(SimulationService);
        
        // Reset all mocks
        Object.values(repos).forEach((repo: any) => {
            if (repo.findOne) repo.findOne.mockReset();
            if (repo.find) repo.find.mockReset();
        });

        // Default setup
        repos.contract.findOne.mockResolvedValue(mockContract);
        repos.line.find.mockResolvedValue([mockLine]);
        repos.reduction.find.mockResolvedValue([]);
        repos.monoparental.find.mockResolvedValue([]);
        repos.earlyBooking.find.mockResolvedValue([]);
        repos.spo.find.mockResolvedValue([]);
        repos.supplement.find.mockResolvedValue([]);
        repos.affiliateEmailSpo.findOne.mockResolvedValue(null);
        contractMatcher.assertContractMatches.mockReset();
        contractMatcher.assertContractMatches.mockResolvedValue(undefined);
    });

    describe('Exceptions & Validations', () => {
        it('should throw NotFoundException if contract not found', async () => {
            repos.contract.findOne.mockResolvedValue(null);
            await expect(service.calculate(1, { contractId: 999 } as any)).rejects.toThrow('Contract #999 not found');
        });

        it('should throw BadRequestException if contract is not active', async () => {
            repos.contract.findOne.mockResolvedValue({ ...mockContract, status: ContractStatus.DRAFT });
            await expect(service.calculate(1, { contractId: 1 } as any)).rejects.toThrow('is not allowed for simulation');
        });

        it('should throw BadRequestException if checkOut is before checkIn', async () => {
            await expect(service.calculate(1, { 
                contractId: 1, 
                checkIn: '2025-01-10', 
                checkOut: '2025-01-05' 
            } as any)).rejects.toThrow('Check-out date must be after check-in date');
        });

        it('should validate selected contract against affiliate and stay dates before pricing', async () => {
            await service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                boardTypeId: 1,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: createRoomingList(1, 2),
            } as any);

            expect(contractMatcher.assertContractMatches).toHaveBeenCalledWith({
                hotelId: 1,
                affiliateId: 10,
                contractId: 1,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                allowedStatuses: [ContractStatus.ACTIVE],
            });
        });

        it('should reject calculation when selected contract does not match affiliate or stay dates', async () => {
            contractMatcher.assertContractMatches.mockRejectedValue(new BadRequestException('Contract #1 is not valid for affiliate #10'));

            await expect(service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                boardTypeId: 1,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: createRoomingList(1, 2),
            } as any)).rejects.toThrow('not valid for affiliate #10');
        });

        it('should reject a room without boardTypeId when no legacy global boardTypeId is provided', async () => {
            await expect(service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: createRoomingList(1, 2),
            } as any)).rejects.toThrow('boardTypeId is required for room #1');
        });

        it('should reject expired contracts by default when includeInactive is not set', async () => {
            repos.contract.findOne.mockResolvedValue({ ...mockContract, status: ContractStatus.EXPIRED });

            await expect(service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: [{ ...createRoomingList(1, 2)[0], boardTypeId: 1 }],
            } as any)).rejects.toThrow('Enable includeInactive');
        });

        it('should allow expired contracts when includeInactive is set by a commercial user', async () => {
            repos.contract.findOne.mockResolvedValue({ ...mockContract, status: ContractStatus.EXPIRED });

            const res = await service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                includeInactive: true,
                inactiveOverrideReason: 'Benchmarking last year contract',
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: [{ ...createRoomingList(1, 2)[0], boardTypeId: 1 }],
            } as any, { id: 7, role: 'COMMERCIAL', email: 'commercial@test.com', hotelIds: [1], tenantId: null } as any);

            expect(contractMatcher.assertContractMatches).toHaveBeenCalledWith(expect.objectContaining({
                allowedStatuses: [ContractStatus.ACTIVE, ContractStatus.EXPIRED, ContractStatus.TERMINATED],
            }));
            expect(res.contractStatus).toBe(ContractStatus.EXPIRED);
            expect(res.inactiveContractOverride).toEqual({
                enabled: true,
                contractStatus: ContractStatus.EXPIRED,
                reason: 'Benchmarking last year contract',
            });
        });

        it('should ignore includeInactive when the user does not have permission', async () => {
            repos.contract.findOne.mockResolvedValue({ ...mockContract, status: ContractStatus.EXPIRED });

            await expect(service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                includeInactive: true,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: [{ ...createRoomingList(1, 2)[0], boardTypeId: 1 }],
            } as any, { id: 8, role: 'AGENT', email: 'agent@test.com', hotelIds: [1], tenantId: null } as any)).rejects.toThrow(
                'Enable includeInactive',
            );
        });
    });

    describe('Room-level board handling', () => {
        it('should calculate a single room using room-level boardTypeId without global boardTypeId', async () => {
            const res = await service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: [{ ...createRoomingList(1, 2)[0], boardTypeId: 1 }],
            } as any);

            expect(res.totalGross).toBe(200);
            expect(res.roomsBreakdown[0].boardTypeId).toBe(1);
        });

        it('should expose a coherent per-room pricing trace in the current rule order', async () => {
            const res = await service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: [{ ...createRoomingList(1, 2)[0], boardTypeId: 1 }],
            } as any);

            const trace = res.roomsBreakdown[0].pricingTrace;
            expect(trace.map(step => step.stage)).toEqual([
                'base_rate',
                'occupancy',
                'promotion_selection',
                'spo',
                'early_booking',
                'board_meal_plan',
                'mandatory_supplements',
                'stay_adjustments',
                'room_total',
            ]);
            trace.forEach(step => {
                expect(step.afterAmount).toBeCloseTo(step.beforeAmount + step.deltaAmount, 3);
            });
            expect(trace[trace.length - 1].afterAmount).toBe(res.roomsBreakdown[0].roomTotalNet);
        });

        it('should calculate multiple rooms with the same room-level boardTypeId', async () => {
            const res = await service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: [
                    { ...createRoomingList(1, 2)[0], boardTypeId: 1 },
                    { ...createRoomingList(1, 2)[0], boardTypeId: 1 },
                ],
            } as any);

            expect(res.totalGross).toBe(400);
            expect(res.roomsBreakdown.map((room) => room.boardTypeId)).toEqual([1, 1]);
            expect(res.roomsBreakdown).toHaveLength(2);
            const firstTrace = res.roomsBreakdown[0].pricingTrace;
            const secondTrace = res.roomsBreakdown[1].pricingTrace;
            expect(firstTrace[firstTrace.length - 1].afterAmount).toBe(200);
            expect(secondTrace[secondTrace.length - 1].afterAmount).toBe(200);
        });

        it('should calculate meal-plan supplements per room when boards differ', async () => {
            repos.supplement.find.mockResolvedValue([
                createRule({
                    name: 'Half Board',
                    systemCode: SupplementSystemCode.MEAL_PLAN,
                    type: SupplementCalculationType.FIXED,
                    value: 20,
                    isMandatory: true,
                    applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON,
                    targetArrangementId: 2,
                    targetArrangement: { id: 2 },
                }),
            ]);

            const res = await service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: [
                    { ...createRoomingList(1, 2)[0], boardTypeId: 1 },
                    { ...createRoomingList(1, 2)[0], boardTypeId: 2 },
                ],
            } as any);

            expect(res.roomsBreakdown.map((room) => room.boardTypeId)).toEqual([1, 2]);
            expect(res.roomsBreakdown[0].roomTotalNet).toBe(200);
            expect(res.roomsBreakdown[1].roomTotalNet).toBe(240);
            expect(res.totalGross).toBe(440);
            expect(res.roomsBreakdown[0].pricingTrace.find(step => step.stage === 'board_meal_plan')?.deltaAmount).toBe(0);
            expect(res.roomsBreakdown[1].pricingTrace.find(step => step.stage === 'board_meal_plan')?.deltaAmount).toBe(40);
        });

        it('should keep legacy global boardTypeId as a temporary fallback', async () => {
            const res = await service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                boardTypeId: 1,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: createRoomingList(1, 2),
            } as any);

            expect(res.totalGross).toBe(200);
            expect(res.roomsBreakdown[0].boardTypeId).toBe(1);
        });
    });

    describe('Partner Email SPO', () => {
        it('matches an active Email SPO by affiliate and stay dates', async () => {
            repos.affiliateEmailSpo.findOne.mockResolvedValue(
                createEmailSpo({
                    discountPercent: 10,
                    applicationFrom: '2025-06-01',
                    applicationTo: '2025-06-02',
                }),
            );

            const res = await service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: [{ ...createRoomingList(1, 2)[0], boardTypeId: 1 }],
            } as any);

            expect(repos.affiliateEmailSpo.findOne).toHaveBeenCalled();
            expect(res.totalGross).toBe(180);
            expect(res.roomsBreakdown[0].pricingTrace.some((step) => step.stage === 'email_spo')).toBe(true);
        });

        it('applies Email SPO after early booking with rolling mode', async () => {
            repos.earlyBooking.find.mockResolvedValue([
                createRule({
                    id: 11,
                    name: 'EB 20%',
                    value: 20,
                    releaseDays: 1,
                    calculationType: ReductionCalculationType.PERCENTAGE,
                    applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM,
                }),
            ]);
            repos.affiliateEmailSpo.findOne.mockResolvedValue(
                createEmailSpo({
                    discountPercent: 5,
                    applicationStep: AffiliateEmailSpoApplicationStep.AFTER_EARLY_BOOKING,
                    stackMode: AffiliateEmailSpoStackMode.ROLLING,
                }),
            );

            const res = await service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                bookingDate: '2025-05-01',
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: [{ ...createRoomingList(1, 2)[0], boardTypeId: 1 }],
            } as any);

            expect(res.totalGross).toBe(152);
            expect(res.totalRemise).toBe(48);
            expect(res.roomsBreakdown[0].pricingTrace.map((step) => step.stage)).toContain('email_spo');
            expect(res.roomsBreakdown[0].pricingTrace.find((step) => step.stage === 'email_spo')).toEqual(
                expect.objectContaining({
                    type: 'EMAIL_SPO',
                    stackMode: AffiliateEmailSpoStackMode.ROLLING,
                    applicationStep: AffiliateEmailSpoApplicationStep.AFTER_EARLY_BOOKING,
                    baseAmount: 160,
                    discountAmount: 8,
                }),
            );
        });

        it('applies Email SPO after contract SPO with rolling mode', async () => {
            repos.spo.find.mockResolvedValue([
                createRule({
                    id: 21,
                    name: 'Contract SPO 10%',
                    conditionType: SpoConditionType.NONE,
                    benefitType: SpoBenefitType.PERCENTAGE_DISCOUNT,
                    benefitValue: 10,
                    value: 10,
                    applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM,
                    stayNights: 0,
                    payNights: 0,
                }),
            ]);
            repos.affiliateEmailSpo.findOne.mockResolvedValue(
                createEmailSpo({
                    discountPercent: 5,
                    applicationStep: AffiliateEmailSpoApplicationStep.AFTER_CONTRACT_SPO,
                }),
            );

            const res = await service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: [{ ...createRoomingList(1, 2)[0], boardTypeId: 1 }],
            } as any);

            expect(res.totalGross).toBe(171);
            expect(res.totalRemise).toBe(29);
            expect(res.roomsBreakdown[0].pricingTrace.find((step) => step.stage === 'email_spo')?.baseAmount).toBe(180);
        });

        it('applies Email SPO after supplement when the room has mandatory supplements', async () => {
            repos.supplement.find.mockResolvedValue([
                createRule({
                    id: 31,
                    name: 'Gala Dinner',
                    systemCode: SupplementSystemCode.GALA_DINNER,
                    type: SupplementCalculationType.FIXED,
                    value: 20,
                    isMandatory: true,
                    applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM,
                }),
            ]);
            repos.affiliateEmailSpo.findOne.mockResolvedValue(
                createEmailSpo({
                    discountPercent: 5,
                    applicationStep: AffiliateEmailSpoApplicationStep.AFTER_SUPPLEMENT,
                }),
            );

            const res = await service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: [{ ...createRoomingList(1, 2)[0], boardTypeId: 1 }],
            } as any);

            expect(res.totalGross).toBe(209);
            expect(res.totalRemise).toBe(11);
            expect(res.roomsBreakdown[0].pricingTrace.find((step) => step.stage === 'email_spo')?.baseAmount).toBe(220);
        });
    });

    it('Test 1 (Le Basique) : 2 Adultes, 1 nuit standard (Attendu : 200 TND)', async () => {
        const res = await service.calculate(1, {
            contractId: 1,
            boardTypeId: 1,
            checkIn: '2025-06-01',
            checkOut: '2025-06-02',
            roomingList: createRoomingList(1, 2)
        } as any);

        console.log(`[BASIQUE] Total pour 2 adultes: ${res.totalGross} ${res.currency}`);
        expect(res.totalGross).toBe(200);
    });

    it('Test 2 (La Famille Standard) : 2 Adultes + 1 Enfant (8 ans), 1 nuit (Attendu : 250 TND)', async () => {
        const reductionEnfant = createRule({
            systemCode: ReductionSystemCode.CHILD,
            paxOrder: 1,
            minAge: 2,
            maxAge: 11,
            calculationType: ReductionCalculationType.PERCENTAGE,
            value: 50,
        });

        repos.reduction.find.mockResolvedValue([reductionEnfant]);

        const res = await service.calculate(1, {
            contractId: 1,
            boardTypeId: 1,
            checkIn: '2025-06-01',
            checkOut: '2025-06-02',
            roomingList: createRoomingList(1, 2, [8])
        } as any);

        console.log(`[FAMILLE] Total 2 Ad + 1 Chd (8 ans): ${res.totalGross} ${res.currency}`);
        expect(res.totalGross).toBe(250);
    });

    it('Test 3 (L\'Événementiel Filtré par Âge) : 2 Adultes + 1 Enfant (8 ans) le 31 Décembre (Attendu : 550 TND)', async () => {
        const reductionEnfant = createRule({
            systemCode: ReductionSystemCode.CHILD,
            paxOrder: 1,
            minAge: 2,
            maxAge: 11,
            calculationType: ReductionCalculationType.PERCENTAGE,
            value: 50,
        });

        const galaAdult = createRule({
            name: 'Gala Dinner Adult',
            systemCode: SupplementSystemCode.GALA_DINNER,
            isMandatory: true,
            specificDate: '2025-12-31',
            value: 120,
            applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON,
            minAge: 12,
            maxAge: 99,
        });

        const galaChild = createRule({
            name: 'Gala Dinner Child',
            systemCode: SupplementSystemCode.GALA_DINNER,
            isMandatory: true,
            specificDate: '2025-12-31',
            value: 60,
            applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON,
            minAge: 2,
            maxAge: 11,
        });

        repos.reduction.find.mockResolvedValue([reductionEnfant]);
        repos.supplement.find.mockResolvedValue([galaAdult, galaChild]);

        const res = await service.calculate(1, {
            contractId: 1,
            boardTypeId: 1,
            checkIn: '2025-12-31',
            checkOut: '2026-01-01',
            roomingList: createRoomingList(1, 2, [8])
        } as any);

        console.log(`[GALA] Total 31 Déc (2 Ad + 1 Chd): ${res.totalGross} ${res.currency}`);
        expect(res.totalGross).toBe(550);
    });

    it('Test 4 (L\'Exception / Override) : Le Parent Solo (1 Adulte + 1 Enfant de 5 ans) (Attendu : 150 TND)', async () => {
        const singleSupp = createRule({
            name: 'Supplément Single',
            systemCode: SupplementSystemCode.SINGLE_OCCUPANCY,
            isMandatory: true,
            value: 50,
            type: SupplementCalculationType.FIXED,
            applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM,
        });

        const monoRule = createRule({
            name: 'Promo Mono',
            childCount: 1,
            minAge: 0,
            maxAge: 12,
            baseRateType: BaseRateType.SINGLE,
            childSurchargePercentage: 0,
            childSurchargeBase: ChildSurchargeBase.SINGLE,
        });

        repos.supplement.find.mockResolvedValue([singleSupp]);
        repos.monoparental.find.mockResolvedValue([monoRule]);

        const res = await service.calculate(1, {
            contractId: 1,
            boardTypeId: 1,
            checkIn: '2025-06-01',
            checkOut: '2025-06-02',
            roomingList: createRoomingList(1, 1, [5])
        } as any);

        console.log(`[MONO] Total 1 Ad + 1 Chd: ${res.totalGross} ${res.currency}`);
        expect(res.totalGross).toBe(150);
    });

    it('Test 5 (Le Temporel) : 2 Adultes, 1 nuit, avec Early Booking > 30 jours (Attendu : 170 TND)', async () => {
        const ebRule = createRule({
            name: 'EB 15%',
            releaseDays: 30,
            calculationType: ReductionCalculationType.PERCENTAGE,
            value: 15,
            applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON,
        });

        repos.earlyBooking.find.mockResolvedValue([ebRule]);

        const res = await service.calculate(1, {
            contractId: 1,
            boardTypeId: 1,
            checkIn: '2025-06-01',
            checkOut: '2025-06-02',
            bookingDate: '2025-01-01', // Lead time > 30 jours
            roomingList: createRoomingList(1, 2)
        } as any);

        console.log(`[EARLY BOOKING] Total avec -15%: ${res.totalGross} ${res.currency}`);
        expect(res.totalGross).toBe(170);
    });

    it('Test 6 (Le Crash Test Ultime / SPO + Repas) : 2 Adultes, 7 nuits, Stay 7 Pay 6 + Demi-Pension (Attendu : 1620 TND)', async () => {
        const mealSupp = createRule({
            name: 'Half Board Supplement',
            systemCode: SupplementSystemCode.MEAL_PLAN,
            isMandatory: true,
            value: 30,
            applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON,
        });

        const spoRule = createRule({
            name: 'Stay 7 Pay 6',
            benefitType: SpoBenefitType.FREE_NIGHTS,
            stayNights: 7,
            payNights: 6,
            benefitValue: 1,
            applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM, 
        });

        repos.supplement.find.mockResolvedValue([mealSupp]);
        repos.spo.find.mockResolvedValue([spoRule]);

        repos.line.find.mockResolvedValue([{
            id: 1,
            isContracted: true,
            period: { startDate: '2025-06-01', endDate: '2025-06-30' },
            contractRoom: mockRoom,
            prices: [{ amount: 100, arrangement: mockArrangementRO }],
        }]);

        const res = await service.calculate(1, {
            contractId: 1,
            boardTypeId: 1, 
            checkIn: '2025-06-01',
            checkOut: '2025-06-08', 
            roomingList: createRoomingList(1, 2)
        } as any);

        console.log(`[SPO + MEALS] Total 7 nuits (S7P6) + HB: ${res.totalGross} ${res.currency}`);
        expect(res.totalGross).toBe(1620);
        expect(res.roomsBreakdown[0].pricingTrace.find(step => step.stage === 'spo')?.deltaAmount).toBe(-200);
        expect(res.roomsBreakdown[0].pricingTrace.find(step => step.stage === 'board_meal_plan')?.deltaAmount).toBe(420);
    });

    describe('Rolling discount model', () => {
        it('should apply SPO and early-booking percentage discounts sequentially on the running subtotal', async () => {
            const spoRule = createRule({
                id: 501,
                name: 'SPO 10%',
                benefitType: SpoBenefitType.PERCENTAGE_DISCOUNT,
                benefitValue: 10,
                applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM,
            });
            const ebRule = createRule({
                id: 601,
                name: 'EB 10%',
                releaseDays: 30,
                calculationType: ReductionCalculationType.PERCENTAGE,
                value: 10,
                applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM,
            });

            repos.spo.find.mockResolvedValue([spoRule]);
            repos.earlyBooking.find.mockResolvedValue([ebRule]);

            const res = await service.calculate(1, {
                contractId: 1,
                boardTypeId: 1,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                bookingDate: '2025-01-01',
                roomingList: createRoomingList(1, 2),
            } as any);

            expect(res.totalGross).toBe(162);
            expect(res.roomsBreakdown[0].dailyRates[0].promotionApplied).toEqual({
                name: 'SPO (SPO 10%) + Early Booking (EB 10%)',
                amount: -38,
            });
            expect(res.roomsBreakdown[0].pricingTrace.find(step => step.stage === 'spo')).toMatchObject({
                label: 'SPO (SPO 10%)',
                deltaAmount: -20,
                sourceType: 'SPO',
                sourceId: 501,
            });
            expect(res.roomsBreakdown[0].pricingTrace.find(step => step.stage === 'early_booking')).toMatchObject({
                label: 'Early Booking (EB 10%)',
                beforeAmount: 180,
                deltaAmount: -18,
                afterAmount: 162,
                sourceType: 'EARLY_BOOKING',
                sourceId: 601,
            });
        });

        it('should keep room-level board supplements outside the SPO percentage discount base', async () => {
            repos.supplement.find.mockResolvedValue([
                createRule({
                    name: 'Half Board',
                    systemCode: SupplementSystemCode.MEAL_PLAN,
                    type: SupplementCalculationType.FIXED,
                    value: 20,
                    isMandatory: true,
                    applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON,
                    targetArrangementId: 2,
                    targetArrangement: { id: 2 },
                }),
            ]);
            repos.spo.find.mockResolvedValue([
                createRule({
                    id: 502,
                    name: 'SPO 10%',
                    benefitType: SpoBenefitType.PERCENTAGE_DISCOUNT,
                    benefitValue: 10,
                    applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM,
                }),
            ]);

            const res = await service.calculate(1, {
                contractId: 1,
                affiliateId: 10,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: [
                    { ...createRoomingList(1, 2)[0], boardTypeId: 1 },
                    { ...createRoomingList(1, 2)[0], boardTypeId: 2 },
                ],
            } as any);

            expect(res.roomsBreakdown[0].roomTotalNet).toBe(180);
            expect(res.roomsBreakdown[1].roomTotalNet).toBe(220);
            expect(res.totalGross).toBe(400);
            expect(res.roomsBreakdown[0].pricingTrace.find(step => step.stage === 'board_meal_plan')?.deltaAmount).toBe(0);
            expect(res.roomsBreakdown[1].pricingTrace.find(step => step.stage === 'board_meal_plan')?.deltaAmount).toBe(40);
            expect(res.roomsBreakdown[1].pricingTrace.find(step => step.stage === 'spo')?.deltaAmount).toBe(-20);
        });

        it('should apply an AGE triggered SPO only when an adult reaches the configured age', async () => {
            repos.spo.find.mockResolvedValue([
                createRule({
                    id: 503,
                    name: 'Senior 10%',
                    conditionType: SpoConditionType.AGE,
                    conditionValue: 65,
                    benefitType: SpoBenefitType.PERCENTAGE_DISCOUNT,
                    benefitValue: 10,
                    applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM,
                }),
            ]);

            const seniorRes = await service.calculate(1, {
                contractId: 1,
                boardTypeId: 1,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: [{
                    roomId: 1,
                    occupants: [
                        { paxOrder: 1, type: OccupantType.ADULT, age: 65 },
                        { paxOrder: 2, type: OccupantType.ADULT, age: 30 },
                    ],
                }],
            } as any);

            const regularRes = await service.calculate(1, {
                contractId: 1,
                boardTypeId: 1,
                checkIn: '2025-06-01',
                checkOut: '2025-06-02',
                roomingList: createRoomingList(1, 2),
            } as any);

            expect(seniorRes.totalGross).toBe(180);
            expect(seniorRes.roomsBreakdown[0].pricingTrace.find(step => step.stage === 'spo')).toMatchObject({
                label: 'SPO (Senior 10%)',
                deltaAmount: -20,
            });
            expect(regularRes.totalGross).toBe(200);
            const regularSpoTrace = regularRes.roomsBreakdown[0].pricingTrace.find(step => step.stage === 'spo');
            expect(regularSpoTrace).toMatchObject({ label: 'No SPO applied' });
            expect(Math.abs(regularSpoTrace?.deltaAmount ?? 1)).toBe(0);
        });
    });

    it('Test 7 (Le Chevauchement de Saisons) : 2 Adultes, 2 nuits Basse Saison + 2 nuits Haute Saison (Attendu : 1000 TND)', async () => {
        repos.line.find.mockResolvedValue([
            {
                id: 1,
                isContracted: true,
                period: { startDate: '2025-06-01', endDate: '2025-06-02' }, 
                contractRoom: mockRoom,
                prices: [{ amount: 100, arrangement: mockArrangementRO }],
            },
            {
                id: 2,
                isContracted: true,
                period: { startDate: '2025-06-03', endDate: '2025-06-04' }, 
                contractRoom: mockRoom,
                prices: [{ amount: 150, arrangement: mockArrangementRO }],
            }
        ]);

        const res = await service.calculate(1, {
            contractId: 1,
            boardTypeId: 1,
            checkIn: '2025-06-01',
            checkOut: '2025-06-05', 
            roomingList: createRoomingList(1, 2)
        } as any);

        console.log(`[SAISONS] Total 4 nuits à cheval : ${res.totalGross} ${res.currency}`);
        expect(res.totalGross).toBe(1000);
    });

    it('Test 8 (L\'Arbitrage SPO vs SPO) : 14 nuits (S7P6 vs S14P12) (Attendu : 2400 TND)', async () => {
        const spo1 = createRule({
            name: 'Stay 7 Pay 6',
            benefitType: SpoBenefitType.FREE_NIGHTS,
            stayNights: 7,
            payNights: 6,
            benefitValue: 1,
        });

        const spo2 = createRule({
            name: 'Stay 14 Pay 12',
            benefitType: SpoBenefitType.FREE_NIGHTS,
            stayNights: 14,
            payNights: 12,
            benefitValue: 2,
        });

        repos.spo.find.mockResolvedValue([spo1, spo2]);
        repos.line.find.mockResolvedValue([{
            id: 1,
            isContracted: true,
            period: { startDate: '2025-06-01', endDate: '2025-06-30' },
            contractRoom: mockRoom,
            prices: [{ amount: 100, arrangement: mockArrangementRO }],
        }]);

        const res = await service.calculate(1, {
            contractId: 1,
            boardTypeId: 1,
            checkIn: '2025-06-01',
            checkOut: '2025-06-15',
            roomingList: createRoomingList(1, 2)
        } as any);

        console.log(`[SPO ARBITRAGE] Total 14 nuits (12 payantes) : ${res.totalGross} ${res.currency}`);
        expect(res.totalGross).toBe(2400);
    });

    it('Test 9 (Le Max Pax / 3ème Lit Adulte) : 3 Adultes dans une chambre Triple (Attendu : 275 TND)', async () => {
        const thirdAdultRule = createRule({
            systemCode: ReductionSystemCode.EXTRA_ADULT,
            paxOrder: 3,
            calculationType: ReductionCalculationType.PERCENTAGE,
            value: 25,
        });

        repos.reduction.find.mockResolvedValue([thirdAdultRule]);

        const res = await service.calculate(1, {
            contractId: 1,
            boardTypeId: 1,
            checkIn: '2025-06-01',
            checkOut: '2025-06-02',
            roomingList: createRoomingList(1, 3)
        } as any);

        console.log(`[PAX 3] Total 3 Adultes (3ème lit à -25%) : ${res.totalGross} ${res.currency}`);
        expect(res.totalGross).toBe(275);
    });

    it('Test 10 (Le Piège du Repas sur Nuit Gratuite) : 7 Nuits (S7P6) + Dîner de Gala Actif (Attendu : 1440 TND)', async () => {
        const galaAdult = createRule({
            name: 'Gala',
            systemCode: SupplementSystemCode.GALA_DINNER,
            isMandatory: true,
            specificDate: '2025-06-07', 
            value: 120,
            applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON,
        });

        const spoRule = createRule({
            name: 'Stay 7 Pay 6',
            benefitType: SpoBenefitType.FREE_NIGHTS,
            stayNights: 7,
            payNights: 6,
            benefitValue: 1,
        });

        repos.supplement.find.mockResolvedValue([galaAdult]);
        repos.spo.find.mockResolvedValue([spoRule]);

        repos.line.find.mockResolvedValue([{
            id: 1,
            isContracted: true,
            period: { startDate: '2025-06-01', endDate: '2025-06-30' },
            contractRoom: mockRoom,
            prices: [{ amount: 100, arrangement: mockArrangementRO }],
        }]);

        const res = await service.calculate(1, {
            contractId: 1,
            boardTypeId: 1,
            checkIn: '2025-06-01',
            checkOut: '2025-06-08',
            roomingList: createRoomingList(1, 2)
        } as any);

        console.log(`[FREE NIGHT + SUPP] Chambre 1200 + Repas Gala 240 : ${res.totalGross} ${res.currency}`);
        expect(res.totalGross).toBe(1440);
    });

    it('Test 11 (La Limite d\'Âge stricte) : 2 Adultes + 1 Enfant (13 ans), maxAge enfant = 12 (Attendu : 300 TND)', async () => {
        const reductionEnfant = createRule({
            systemCode: ReductionSystemCode.CHILD,
            paxOrder: 1,
            minAge: 2,
            maxAge: 12, 
            calculationType: ReductionCalculationType.PERCENTAGE,
            value: 50,
        });

        repos.reduction.find.mockResolvedValue([reductionEnfant]);

        const res = await service.calculate(1, {
            contractId: 1,
            boardTypeId: 1,
            checkIn: '2025-06-01',
            checkOut: '2025-06-02',
            roomingList: createRoomingList(1, 2, [13])
        } as any);

        console.log(`[LIMITE ÂGE] Total 2 Ad + 1 Adulte au prix fort (Enfant > 12 ans) : ${res.totalGross} ${res.currency}`);
        expect(res.totalGross).toBe(300);
    });
});
