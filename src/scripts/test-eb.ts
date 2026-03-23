import { Test, TestingModule } from '@nestjs/testing';
import { SimulationService } from '../modules/simulation/simulation.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Contract } from '../modules/contract/core/entities/contract.entity';
import { ContractLine } from '../modules/contract/core/entities/contract-line.entity';
import { ContractReduction } from '../modules/contract/reduction/entities/contract-reduction.entity';
import { ContractMonoparentalRule } from '../modules/contract/monoparental/entities/contract-monoparental-rule.entity';
import { ContractEarlyBooking } from '../modules/contract/early-booking/entities/contract-early-booking.entity';
import { ContractSpo } from '../modules/contract/spo/entities/contract-spo.entity';
import { ContractSupplement } from '../modules/contract/supplement/entities/contract-supplement.entity';
import { 
    ContractStatus, 
    ReductionCalculationType, 
    PricingModifierApplicationType,
    SupplementSystemCode,
    SupplementCalculationType
} from '../common/constants/enums';

async function runTest() {
    const mockContractRepo = {
        findOne: async () => ({
            id: 1,
            status: ContractStatus.ACTIVE,
            currency: 'TND',
            periods: [],
            contractRooms: [{ id: 1, roomType: { id: 1 } }]
        })
    };

    const mockReductionRepo = { find: async () => [] };
    const mockMonoparentalRepo = { find: async () => [] };

    // EARLY BOOKING RULE: -15%, 30 days release
    const mockEarlyBookingRepo = { 
        find: async () => ([{
            id: 1,
            name: 'EB -15%',
            calculationType: ReductionCalculationType.PERCENTAGE,
            value: 15,
            releaseDays: 30,
            applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM,
            applicableContractRooms: [],
            applicablePeriods: []
        }]) 
    };

    const mockSpoRepo = { find: async () => [] };

    // GALA DINNER (AFTER EB)
    const mockSupplementRepo = {
        find: async () => ([{
            id: 1,
            name: 'Gala Dinner',
            systemCode: SupplementSystemCode.GALA_DINNER,
            minAge: 0,
            maxAge: 99,
            value: 50,
            type: SupplementCalculationType.FIXED,
            applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON,
            isMandatory: true,
            specificDate: '2026-12-31',
            applicableContractRooms: [],
            applicablePeriods: []
        }])
    };

    const mockLineRepo = {
        find: async () => ([{
            id: 1,
            isContracted: true,
            period: { id: 1, startDate: '2026-01-01', endDate: '2027-12-31' },
            contractRoom: { id: 1, roomType: { id: 1 } },
            prices: [{ amount: 100, arrangement: { id: 1 } }]
        }])
    };

    const module: TestingModule = await Test.createTestingModule({
        providers: [
            SimulationService,
            { provide: getRepositoryToken(Contract), useValue: mockContractRepo },
            { provide: getRepositoryToken(ContractLine), useValue: mockLineRepo },
            { provide: getRepositoryToken(ContractReduction), useValue: mockReductionRepo },
            { provide: getRepositoryToken(ContractMonoparentalRule), useValue: mockMonoparentalRepo },
            { provide: getRepositoryToken(ContractEarlyBooking), useValue: mockEarlyBookingRepo },
            { provide: getRepositoryToken(ContractSpo), useValue: mockSpoRepo },
            { provide: getRepositoryToken(ContractSupplement), useValue: mockSupplementRepo },
        ],
    }).compile();

    const service = module.get<SimulationService>(SimulationService);

    console.log('--- DÉBUT DU CRASH TEST : "Early Booking & Gala" ---');
    console.log('Check-in: 2026-12-31 | Booking: 2026-10-01 (Lead Time: >30 jours)');
    console.log('Paramètres : 2 Adultes, Base Adult : 100 TND');

    const request = {
        contractId: 1,
        roomId: 1,
        boardTypeId: 1,
        checkIn: '2026-12-31',
        checkOut: '2027-01-01', // 1 nuit
        bookingDate: '2026-10-01',
        occupants: {
            adults: 2,
            childrenAges: []
        }
    };

    const result = await service.calculate(request as any);

    console.log('\n--- DEBUG INFO ---');
    console.log(`day.dateStr: ${result.dailyBreakdown[0].date}`);
    const mockSupp = (await mockSupplementRepo.find())[0];
    console.log(`supplement specificDate: ${mockSupp.specificDate}`);
    console.log(`isForDate match: ${mockSupp.specificDate === result.dailyBreakdown[0].date}`);

    console.log('\n--- TICKET DE CAISSE DE LA NUIT ---');
    const day = result.dailyBreakdown[0];
    
    console.log(`Base Rate Unitaire : ${day.baseRate} TND`);
    console.log(`=> Net Occupation Chambre (2 Adultes) : ${day.netRate} TND`);
    
    if (day.promotionApplied) {
        console.log(`- Promotion : ${day.promotionApplied.name} = ${day.promotionApplied.amount} TND`);
    }
    
    console.log(`=> Tarif après EB (Promo Rate) : ${day.promoRate} TND`);

    console.log('\n--- SUPPLÉMENTS ADDITIONNELS ---');
    day.supplementsApplied.forEach(s => {
        console.log(`- Supplément : ${s.name} = +${s.amount} TND`);
    });

    console.log(`\n=> FINAL NUIT / TOTAL ATTENDU : ${day.finalDailyRate} TND`);

    // Expected:
    // Base 2 adults = 200
    // EB = -15% of 200 = -30 -> Promo Rate = 170
    // Gala = 50 * 2 = 100
    // Total = 170 + 100 = 270

    const expectedTotal = 270;
    if (result.totalGross === expectedTotal) {
        console.log(`\n✅ TEST PASSED: Le total calculé est exactement de ${expectedTotal} TND.`);
    } else {
        console.error(`\n❌ TEST FAILED: Attendu ${expectedTotal} TND, obtenu ${result.totalGross} TND.`);
    }
}

runTest().catch(console.error);