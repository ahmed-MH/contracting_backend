import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SimulationService } from './simulation.service';
import { Contract } from '../contract/core/entities/contract.entity';
import { ContractLine } from '../contract/core/entities/contract-line.entity';
import { ContractReduction } from '../contract/reduction/entities/contract-reduction.entity';
import { ContractMonoparentalRule } from '../contract/monoparental/entities/contract-monoparental-rule.entity';
import { ContractEarlyBooking } from '../contract/early-booking/entities/contract-early-booking.entity';
import { ContractSpo } from '../contract/spo/entities/contract-spo.entity';
import { ContractSupplement } from '../contract/supplement/entities/contract-supplement.entity';
import { 
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
    };

    const mockContract = {
        id: 1,
        status: ContractStatus.ACTIVE,
        currency: 'TND',
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

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SimulationService,
                { provide: getRepositoryToken(Contract), useValue: repos.contract },
                { provide: getRepositoryToken(ContractLine), useValue: repos.line },
                { provide: getRepositoryToken(ContractReduction), useValue: repos.reduction },
                { provide: getRepositoryToken(ContractMonoparentalRule), useValue: repos.monoparental },
                { provide: getRepositoryToken(ContractEarlyBooking), useValue: repos.earlyBooking },
                { provide: getRepositoryToken(ContractSpo), useValue: repos.spo },
                { provide: getRepositoryToken(ContractSupplement), useValue: repos.supplement },
            ],
        }).compile();

        service = module.get<SimulationService>(SimulationService);
        
        // Reset all mocks
        Object.values(repos).forEach(repo => {
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
    });

    it('Test 1 (Le Basique) : 2 Adultes, 1 nuit standard (Attendu : 200 TND)', async () => {
        const res = await service.calculate({
            contractId: 1,
            roomId: 1,
            boardTypeId: 1,
            checkIn: '2025-06-01',
            checkOut: '2025-06-02',
            occupants: { adults: 2, childrenAges: [] }
        });

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

        const res = await service.calculate({
            contractId: 1,
            roomId: 1,
            boardTypeId: 1,
            checkIn: '2025-06-01',
            checkOut: '2025-06-02',
            occupants: { adults: 2, childrenAges: [8] }
        });

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

        const res = await service.calculate({
            contractId: 1,
            roomId: 1,
            boardTypeId: 1,
            checkIn: '2025-12-31',
            checkOut: '2026-01-01',
            occupants: { adults: 2, childrenAges: [8] }
        });

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

        const res = await service.calculate({
            contractId: 1,
            roomId: 1,
            boardTypeId: 1,
            checkIn: '2025-06-01',
            checkOut: '2025-06-02',
            occupants: { adults: 1, childrenAges: [5] }
        });

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

        const res = await service.calculate({
            contractId: 1,
            roomId: 1,
            boardTypeId: 1,
            checkIn: '2025-06-30',
            checkOut: '2025-07-01',
            bookingDate: '2025-05-01', 
            occupants: { adults: 2, childrenAges: [] }
        });

        console.log(`[EARLY BOOKING] Total avec -15%: ${res.totalGross} ${res.currency}`);
        expect(res.totalGross).toBe(170);
    });

    it('Test 6 (Le Crash Test Ultime / SPO + Repas) : 2 Adultes, 7 nuits, Stay 7 Pay 6 + Demi-Pension (Attendu : 1620 TND)', async () => {
        const hbSupplement = createRule({
            name: 'Demi-Pension',
            systemCode: SupplementSystemCode.MEAL_PLAN,
            isMandatory: true,
            value: 30,
            applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON,
            minAge: 12,
            maxAge: 99,
        });

        const spoRule = createRule({
            name: 'Stay 7 Pay 6',
            benefitType: SpoBenefitType.FREE_NIGHTS,
            stayNights: 7,
            payNights: 6,
        });

        repos.supplement.find.mockResolvedValue([hbSupplement]);
        repos.spo.find.mockResolvedValue([spoRule]);

        const res = await service.calculate({
            contractId: 1,
            roomId: 1,
            boardTypeId: 1,
            checkIn: '2025-06-01',
            checkOut: '2025-06-08',
            occupants: { adults: 2, childrenAges: [] }
        });

        console.log(`[SPO + MEALS] Total 7 nuits (S7P6) + HB: ${res.totalGross} ${res.currency}`);
        expect(res.totalGross).toBe(1620);
    });
});
