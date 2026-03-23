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
    PricingModifierApplicationType,
    SpoConditionType,
    SpoBenefitType
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
    const mockEarlyBookingRepo = { find: async () => [] };

    // SPO RULE: Stay 7 Pay 6
    const mockSpoRepo = { 
        find: async () => ([{
            id: 1,
            name: 'SPO Stay 7 Pay 6',
            conditionType: SpoConditionType.MIN_NIGHTS,
            conditionValue: 7,
            stayNights: 7,
            payNights: 6,
            benefitType: SpoBenefitType.FREE_NIGHTS,
            applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM,
            applicableContractRooms: [],
            applicablePeriods: [],
            applicableArrangements: []
        }]) 
    };

    const mockSupplementRepo = { find: async () => [] };

    // 7 nights with varying prices (to test if it picks the cheapest)
    const mockLineRepo = {
        find: async () => ([
            {
                id: 1,
                isContracted: true,
                period: { id: 1, startDate: '2026-08-01T00:00:00', endDate: '2026-08-03T23:59:59' }, // First 3 nights: 100 TND
                contractRoom: { id: 1, roomType: { id: 1 } },
                prices: [{ amount: 100, arrangement: { id: 1 } }]
            },
            {
                id: 2,
                isContracted: true,
                period: { id: 2, startDate: '2026-08-04T00:00:00', endDate: '2026-08-05T23:59:59' }, // Next 2 nights: 80 TND (Cheapest)
                contractRoom: { id: 1, roomType: { id: 1 } },
                prices: [{ amount: 80, arrangement: { id: 1 } }]
            },
            {
                id: 3,
                isContracted: true,
                period: { id: 3, startDate: '2026-08-06T00:00:00', endDate: '2026-08-10T23:59:59' }, // Last nights: 120 TND
                contractRoom: { id: 1, roomType: { id: 1 } },
                prices: [{ amount: 120, arrangement: { id: 1 } }]
            }
        ])
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

    console.log('--- DÉBUT DU CRASH TEST : "SPO Stay 7 Pay 6" ---');
    console.log('Paramètres : 2 Adultes, Séjour de 7 nuits du 01 Août au 08 Août');
    console.log('Prix de base configurés : 3x100, 2x80, 2x120 par adulte.');
    console.log('La nuit gratuite doit être déduite de la période à 80 TND (soit 160 TND pour 2 adultes).');

    const request = {
        contractId: 1,
        roomId: 1,
        boardTypeId: 1,
        checkIn: '2026-08-01',
        checkOut: '2026-08-08', // 7 nuits
        bookingDate: '2026-07-01',
        occupants: {
            adults: 2,
            childrenAges: []
        }
    };

    const result = await service.calculate(request as any);

    console.log('\n--- RÉSULTAT DU CALCUL ---');
    console.log(`Total Brut  : ${result.totalBrut} TND`);
    console.log(`Total Remise: ${result.totalRemise} TND`);
    console.log(`Total Net   : ${result.totalGross} TND`);

    console.log('\n--- DÉTAIL DES NUITS ---');
    result.dailyBreakdown.forEach((day, i) => {
        const promoStr = day.promotionApplied ? ` | Promo: ${day.promotionApplied.name} (${day.promotionApplied.amount} TND)` : '';
        console.log(`Nuit ${i+1} (${day.date}): Net Occ = ${day.netRate} TND${promoStr} => Final = ${day.finalDailyRate} TND`);
    });

    // Expected:
    // Base Rates per adult: 100, 100, 100, 80, 80, 120, 120
    // Net Occupations (x2 adults): 200, 200, 200, 160, 160, 240, 240
    // Total Brut: 1400 TND
    // Cheapest night is 160 TND.
    // SPO Remise: 160 TND
    // Total Net: 1240 TND

    const expectedTotal = 1240;
    if (result.totalGross === expectedTotal) {
        console.log(`\n✅ TEST PASSED: La SPO a bien déduit la nuit la MOINS CHÈRE. Le total calculé est exactement de ${expectedTotal} TND.`);
    } else {
        console.error(`\n❌ TEST FAILED: Attendu ${expectedTotal} TND, obtenu ${result.totalGross} TND.`);
    }
}

runTest().catch(console.error);