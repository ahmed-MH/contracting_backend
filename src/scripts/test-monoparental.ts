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
    PaxType,
    BaseRateType,
    ChildSurchargeBase
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

    // LE PIÈGE : Réduction Enfant Standard
    const mockReductionRepo = {
        find: async () => ([{
            id: 1,
            name: 'PIÈGE : Réduction Enfant 50%',
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

    // RÈGLE MONOPARENTALE : Le parent paie SINGLE, l'enfant paie 0% (Gratuit)
    const mockMonoparentalRepo = { 
        find: async () => ([{
            id: 1,
            name: 'Promo Parent Solo (1Ad+1Chd=SGL)',
            childCount: 1,
            minAge: 2,
            maxAge: 12,
            baseRateType: BaseRateType.SINGLE,
            childSurchargePercentage: 0,
            childSurchargeBase: ChildSurchargeBase.SINGLE,
            applicableContractRooms: [],
            applicablePeriods: []
        }]) 
    };

    const mockEarlyBookingRepo = { find: async () => ([]) };
    const mockSpoRepo = { find: async () => ([]) };

    // SUPPLÉMENT SINGLE
    const mockSupplementRepo = {
        find: async () => ([
            {
                id: 1,
                name: 'Supplément Single Standard',
                systemCode: SupplementSystemCode.SINGLE_OCCUPANCY,
                type: SupplementCalculationType.FIXED,
                value: 50,
                isMandatory: false,
                applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM,
                applicableContractRooms: [],
                applicablePeriods: []
            }
        ])
    };

    const mockLineRepo = {
        find: async () => ([{
            id: 1,
            isContracted: true,
            period: { id: 1, startDate: '2026-01-01', endDate: '2026-12-31' },
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

    console.log('--- DÉBUT DU CRASH TEST : "Le Parent Solo" ---');
    console.log('Paramètres : 1 Adulte, 1 Enfant (5 ans), Base Adult : 100 TND');

    const request = {
        contractId: 1,
        roomId: 1,
        boardTypeId: 1,
        checkIn: '2026-07-15',
        checkOut: '2026-07-16', // 1 nuit
        bookingDate: '2026-06-01',
        occupants: {
            adults: 1,
            childrenAges: [5]
        }
    };

    const result = await service.calculate(request as any);

    console.log('\n--- TICKET DE CAISSE DE LA NUIT ---');
    const day = result.dailyBreakdown[0];
    
    console.log(`Base Rate Unitaire : ${day.baseRate} TND`);
    
    day.reductionsApplied.forEach(r => {
        console.log(`- Ajustement : ${r.name} = +${r.amount} TND`);
    });
    
    console.log(`=> Net Occupation (Chambre + Enfants) : ${day.netRate} TND`);

    console.log('\n--- SUPPLÉMENTS ADDITIONNELS ---');
    day.supplementsApplied.forEach(s => {
        console.log(`- Supplément : ${s.name} = +${s.amount} TND`);
    });

    console.log(`\n=> FINAL NUIT / TOTAL ATTENDU : ${day.finalDailyRate} TND`);

    const expectedTotal = 150;
    if (result.totalGross === expectedTotal) {
        console.log(`\n✅ TEST PASSED: Aucun Double Dipping. Le total calculé est exactement de ${expectedTotal} TND.`);
        
        const isTrapAvoided = !day.reductionsApplied.some(r => r.name.includes('PIÈGE'));
        if (isTrapAvoided) {
             console.log(`🛡️ BYPASS CONFIRMÉ : Le piège (Réduction Enfant 50%) a été ignoré par l'intercepteur.`);
        } else {
             console.error(`❌ BYPASS FAILED : La réduction standard a été appliquée par-dessus !`);
        }
    } else {
        console.error(`\n❌ TEST FAILED: Attendu ${expectedTotal} TND, obtenu ${result.totalGross} TND.`);
    }
}

runTest().catch(console.error);
