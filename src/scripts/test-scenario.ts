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
    ReductionSystemCode, 
    SupplementSystemCode, 
    SupplementCalculationType,
    PricingModifierApplicationType,
    PaxType
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

    // Règle A (Réduction) : systemCode: CHILD, paxOrder: 1, minAge: 2, maxAge: 12, value: 50, type: PERCENTAGE
    const mockReductionRepo = {
        find: async () => ([{
            id: 1,
            name: 'Réduction Enfant',
            systemCode: ReductionSystemCode.CHILD,
            paxOrder: 1,
            paxType: PaxType.FIRST_CHILD,
            minAge: 2,
            maxAge: 12,
            value: 50,
            calculationType: ReductionCalculationType.PERCENTAGE,
            applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON,
            applicableContractRooms: [],
            applicablePeriods: []
        }])
    };

    const mockMonoparentalRepo = { find: async () => ([]) };
    const mockEarlyBookingRepo = { find: async () => ([]) };
    const mockSpoRepo = { find: async () => ([]) };

    // Règle B et C (Suppléments)
    const mockSupplementRepo = {
        find: async () => ([
            {
                id: 1,
                name: 'Dîner Gala Enfant',
                systemCode: SupplementSystemCode.GALA_DINNER,
                minAge: 0,
                maxAge: 11,
                value: 25,
                type: SupplementCalculationType.FIXED,
                applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON,
                isMandatory: true, // Forcer l'application
                specificDate: '2026-12-31', // Simulons une date spécifique qui va matcher
                applicableContractRooms: [],
                applicablePeriods: []
            },
            {
                id: 2,
                name: 'Dîner Gala Adulte',
                systemCode: SupplementSystemCode.GALA_DINNER,
                minAge: 12,
                maxAge: 99,
                value: 50,
                type: SupplementCalculationType.FIXED,
                applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON,
                isMandatory: true, // Forcer l'application
                specificDate: '2026-12-31', // Simulons une date spécifique qui va matcher
                applicableContractRooms: [],
                applicablePeriods: []
            }
        ])
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

    console.log('--- DÉBUT DE LA SIMULATION : "La Famille au Réveillon" ---');
    console.log('Paramètres : 2 Adultes, 1 Enfant (8 ans), Base : 100 TND');
    console.log('Date du séjour : 2026-12-31 (Gala)');

    const request = {
        contractId: 1,
        roomId: 1,
        boardTypeId: 1,
        checkIn: '2026-12-31',
        checkOut: '2027-01-01',
        bookingDate: '2026-10-01',
        occupants: {
            adults: 2,
            childrenAges: [8]
        }
    };

    const result = await service.calculate(request as any);

    console.log('\n--- RÉSULTAT DU CALCUL ---');
    console.log(`Total Brut  : ${result.totalBrut} TND`);
    console.log(`Total Remise: ${result.totalRemise} TND`);
    console.log(`Total Net   : ${result.totalGross} TND`);

    const day = result.dailyBreakdown[0];
    console.log('\n--- DÉTAIL DE LA NUIT (2026-12-31) ---');
    console.log(`Base Chambre (2 Adultes): ${day.baseRate * 2} TND`);
    
    day.reductionsApplied.forEach(r => {
        console.log(`- Réduction/Extra Pax : ${r.name} = +${r.amount} TND`);
    });
    console.log(`=> Net Occupation (Chambre + Pax Extra) : ${day.netRate} TND`);

    console.log('\n--- SUPPLÉMENTS APPLIQUÉS ---');
    day.supplementsApplied.forEach(s => {
        console.log(`- Supplément : ${s.name} = +${s.amount} TND`);
    });

    console.log(`\n=> FINAL NUIT : ${day.finalDailyRate} TND`);

    const expectedTotal = 375;
    if (result.totalGross === expectedTotal) {
        console.log(`\n✅ TEST PASSED: Le total calculé est exactement ${expectedTotal} TND.`);
    } else {
        console.error(`\n❌ TEST FAILED: Attendu ${expectedTotal} TND, obtenu ${result.totalGross} TND.`);
    }
}

runTest().catch(console.error);
