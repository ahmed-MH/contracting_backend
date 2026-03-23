import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { CustomIdSubscriber } from '../common/subscribers/custom-id.subscriber';

// Import Services
import { HotelService } from '../modules/hotel/hotel.service';
import { RoomTypeService } from '../modules/hotel/room-type.service';
import { ArrangementService } from '../modules/hotel/arrangement.service';
import { TemplateSupplementService } from '../modules/catalog/supplement/template-supplement.service';
import { TemplateReductionService } from '../modules/catalog/reduction/template-reduction.service';
import { TemplateMonoparentalRuleService } from '../modules/catalog/monoparental/template-monoparental-rule.service';
import { TemplateEarlyBookingService } from '../modules/catalog/early-booking/template-early-booking.service';
import { TemplateSpoService } from '../modules/catalog/spo/template-spo.service';
import { TemplateCancellationService } from '../modules/catalog/cancellation/template-cancellation.service';
import { ContractService } from '../modules/contract/core/contract.service';
import { ContractSupplementService } from '../modules/contract/supplement/contract-supplement.service';
import { ContractReductionService } from '../modules/contract/reduction/contract-reduction.service';
import { ContractMonoparentalRuleService } from '../modules/contract/monoparental/contract-monoparental-rule.service';
import { ContractEarlyBookingService } from '../modules/contract/early-booking/contract-early-booking.service';
import { ContractSpoService } from '../modules/contract/spo/contract-spo.service';
import { ContractCancellationService } from '../modules/contract/cancellation/contract-cancellation.service';
import { ExchangeRateService } from '../modules/hotel/exchange-rate.service';
import { UsersService } from '../modules/users/users.service';
import { Arrangement } from '../modules/hotel/entities/arrangement.entity';
import { Affiliate } from '../modules/affiliate/entities/affiliate.entity';
import { RoomType } from '../modules/hotel/entities/room-type.entity';

import {
    SupplementCalculationType,
    PricingModifierApplicationType,
    ReductionCalculationType,
    PaxType,
    BaseRateType,
    ChildSurchargeBase,
    SpoConditionType,
    SpoBenefitType,
    AffiliateType,
    PaymentConditionType,
    PaymentMethodType,
    CancellationPenaltyType,
    UserRole,
    ReductionSystemCode,
    SupplementSystemCode
} from '../common/constants/enums';

import { AffiliateService } from '../modules/affiliate/affiliate.service';
import { CreateAffiliateDto } from '../modules/affiliate/dto/create-affiliate.dto';

import { TemplateSupplement } from '../modules/catalog/supplement/entities/template-supplement.entity';
import { TemplateReduction } from '../modules/catalog/reduction/entities/template-reduction.entity';
import { TemplateMonoparentalRule } from '../modules/catalog/monoparental/entities/template-monoparental-rule.entity';
import { TemplateEarlyBooking } from '../modules/catalog/early-booking/entities/template-early-booking.entity';
import { TemplateSpo } from '../modules/catalog/spo/entities/template-spo.entity';

async function resetDb() {
    try {
        console.log('\n🔄 Bootstrapping NestJS application context (Service-Driven Seeding)...');
        const app = await NestFactory.createApplicationContext(AppModule);
        console.log('✅ Context initialized.\n');

        const dataSource = app.get(DataSource);

        // Register the custom ID subscriber manually globally
        const subscriber = new CustomIdSubscriber(dataSource);
        void subscriber;

        console.log('💣 Dropping schema...');
        await dataSource.dropDatabase();
        console.log('✅ Schema dropped.\n');

        console.log('🔧 Synchronizing schema...');
        await dataSource.synchronize();
        console.log('✅ Schema synchronized.\n');

        // ─── SEEDING ──────────────────────────────────────────────────
        console.log('🌱 Starting seed via Services...\n');

        const hotelService = app.get(HotelService);
        const roomTypeService = app.get(RoomTypeService);
        const arrangementService = app.get(ArrangementService);
        const tsService = app.get(TemplateSupplementService);
        const trService = app.get(TemplateReductionService);
        const tmService = app.get(TemplateMonoparentalRuleService);
        const teService = app.get(TemplateEarlyBookingService);
        const tsSpoService = app.get(TemplateSpoService);
        const tcService = app.get(TemplateCancellationService);
        const affiliateService = app.get(AffiliateService);
        const contractService = app.get(ContractService);
        const exchangeRateService = app.get(ExchangeRateService);
        const usersService = app.get(UsersService);

        // 1. Hotel
        const hotel = await hotelService.createHotel({
            name: 'Sousse Pearl Marriott Resort & Spa',
            address: 'Boulevard de la Corniche, 4011 Sousse, Tunisie',
            phone: '+216 73 104 000',
            fax: '+216 73 104 001',
            legalRepresentative: 'Raouf Daaloul',
            fiscalName: 'Sousse Pearl Hospitality SARL',
            vatNumber: '1234567A/P/M/000',
            bankName: 'BIAT',
            accountNumber: '08 123 0000123456789 12',
            ibanCode: 'TN59 0800 0000 1234 5678 9012',
            swiftCode: 'BIATTNTT',
            defaultCurrency: 'TND',
            stars: 5,
            emails: [
                { label: 'Réservations', address: 'reservations@sousse-pearl.com' },
                { label: 'Direction', address: 'direction@sousse-pearl.com' },
                { label: 'Facturation', address: 'facturation@sousse-pearl.com' },
            ],
        });
        console.log(`🏨 Hôtel "${hotel.name}" créé avec succès ! (ID: ${hotel.id})`);

        // 1.5 Exchange Rates
        console.log('\n💱  Taux de Change:');
        const toDateStr = (d: Date) => d.toISOString().split('T')[0];
        const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

        const exchangeRatesToCreate = [
            { currency: 'EUR', rate: 3.35, validFrom: toDateStr(new Date(2024, 0, 1)) },
            { currency: 'USD', rate: 3.12, validFrom: toDateStr(new Date(2024, 0, 1)) },
        ];
        for (const er of exchangeRatesToCreate) {
            const saved = await exchangeRateService.create(hotel.id, er);
            console.log(`  💱  [${saved.currency}] 1 ${saved.currency} = ${saved.rate} ${hotel.defaultCurrency}`);
        }

        // 2. Room Types (PDF Exact)
        console.log('\n🛏️  Types de Chambres (PDF Mapping):');
        const roomTypesData = [
            { code: 'STD', name: 'STD City view room (Double Room)', minOccupancy: 1, maxOccupancy: 3, minAdults: 1, maxAdults: 3, minChildren: 0, maxChildren: 2 },
            { code: 'PSV', name: 'Partial Sea View Room', minOccupancy: 1, maxOccupancy: 3, minAdults: 1, maxAdults: 3, minChildren: 0, maxChildren: 2 },
            { code: 'SVM', name: 'Sea View Room', minOccupancy: 1, maxOccupancy: 3, minAdults: 1, maxAdults: 3, minChildren: 0, maxChildren: 2 },
            { code: 'SPSV', name: 'Suite Partial Sea View', minOccupancy: 1, maxOccupancy: 3, minAdults: 1, maxAdults: 3, minChildren: 0, maxChildren: 2 },
            { code: 'ESSV', name: 'Executive Suite Sea View', minOccupancy: 1, maxOccupancy: 3, minAdults: 1, maxAdults: 3, minChildren: 0, maxChildren: 2 },
        ];
        const roomTypesCreated: RoomType[] = [];
        for (const rt of roomTypesData) {
            const saved = await roomTypeService.createRoomType(hotel.id, rt);
            roomTypesCreated.push(saved);
            console.log(`  🛏️  [${saved.code}] ${saved.name}`);
        }

        // 3. Arrangements
        console.log('\n🍽️  Arrangements (Pensions):');
        const arrangements = [
            { code: 'RO', name: 'Room Only', level: 0 },
            { code: 'LPD', name: 'Logement & Petit Déjeuner', level: 1 },
            { code: 'DP', name: 'Demi-Pension', level: 2 },
            { code: 'PC', name: 'Pension Complète', level: 3 },
            { code: 'ALL', name: 'All Inclusive', level: 4 },
        ];
        const arrangementsCreated: Arrangement[] = [];
        for (const arr of arrangements) {
            const saved = await arrangementService.createArrangement(hotel.id, arr);
            arrangementsCreated.push(saved);
            console.log(`  🍽️  [${saved.code}] ${saved.name}`);
        }

        // 4. Template Supplements
        console.log('\n➕ Catalogues de Suppléments:');
        const supplements = [
            { name: 'Supplément Single (Rooms 01,02,03)', systemCode: SupplementSystemCode.SINGLE_OCCUPANCY, type: SupplementCalculationType.PERCENTAGE, value: 30, isMandatory: false, applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM, minAge: 0, maxAge: 99 },
            { name: 'Supplément Single (Rooms 04,05)', systemCode: SupplementSystemCode.SINGLE_OCCUPANCY, type: SupplementCalculationType.FORMULA, formula: 'SGL = DBL', value: 0, isMandatory: false, applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM, minAge: 0, maxAge: 99 },
            { name: 'Baby cot (0-1.99)', systemCode: SupplementSystemCode.CUSTOM, type: SupplementCalculationType.FREE, value: 0, isMandatory: false, applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM, minAge: 0, maxAge: 1 },
        ];
        const templateSupplementsCreated: TemplateSupplement[] = [];
        for (const s of supplements) {
            const saved = await tsService.createTemplateSupplement(hotel.id, s as any);
            templateSupplementsCreated.push(saved);
            console.log(`  ➕  ${saved.name}`);
        }

        // 5. Template Reductions
        console.log('\n➖ Catalogues de Réductions:');
        const reductions = [
            { name: '1st Child (2-5.99 ans)', systemCode: ReductionSystemCode.CHILD, paxOrder: 1, paxType: PaxType.FIRST_CHILD, minAge: 2, maxAge: 5, calculationType: ReductionCalculationType.PERCENTAGE, value: 50, applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON },
            { name: '3rd Pax', systemCode: ReductionSystemCode.EXTRA_ADULT, paxOrder: 3, paxType: PaxType.THIRD_ADULT, minAge: 6, maxAge: 99, calculationType: ReductionCalculationType.PERCENTAGE, value: 30, applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON },
        ];
        const templateReductionsCreated: TemplateReduction[] = [];
        for (const r of reductions) {
            const saved = await trService.createTemplateReduction(hotel.id, r as any);
            templateReductionsCreated.push(saved);
            console.log(`  ➖  ${saved.name}`);
        }

        // 6. Template Monoparental Rules
        console.log('\n👩‍👦 Catalogues Règles Monoparentales:');
        const monoparentals = [
            { name: 'Monoparental (1Ad + 1Chd 2-5.99) - SGL + 50% 1/2 DBL', adultCount: 1, childCount: 1, minAge: 2, maxAge: 5, baseRateType: BaseRateType.SINGLE, childSurchargePercentage: 50, childSurchargeBase: ChildSurchargeBase.HALF_DOUBLE },
            { name: 'Monoparental (1Ad + 1Chd 2-5.99) - Double', adultCount: 1, childCount: 1, minAge: 2, maxAge: 5, baseRateType: BaseRateType.DOUBLE, childSurchargePercentage: 0, childSurchargeBase: ChildSurchargeBase.SINGLE },
        ];
        const templateMonoparentalsCreated: TemplateMonoparentalRule[] = [];
        for (const m of monoparentals) {
            const saved = await tmService.createTemplateMonoparentalRule(hotel.id, m as any);
            templateMonoparentalsCreated.push(saved);
            console.log(`  👩‍👦  ${saved.name}`);
        }

        // 7. Template Early Booking
        console.log('\n📅 Catalogues Early Bookings:');
        const ebos = [
            { name: 'First EB (-30%)', value: 30, calculationType: ReductionCalculationType.PERCENTAGE, releaseDays: 0, bookingWindowEnd: '2025-01-31', stayWindowStart: '2025-05-01', stayWindowEnd: '2025-10-31', isPrepaid: true, prepaymentPercentage: 50, applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM },
            { name: 'Second EB (-20%)', value: 20, calculationType: ReductionCalculationType.PERCENTAGE, releaseDays: 0, bookingWindowStart: '2025-02-01', bookingWindowEnd: '2025-02-28', stayWindowStart: '2025-05-01', stayWindowEnd: '2025-10-31', isPrepaid: true, prepaymentPercentage: 50, applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM },
            { name: 'Third EB (-15%)', value: 15, calculationType: ReductionCalculationType.PERCENTAGE, releaseDays: 0, bookingWindowStart: '2025-03-01', bookingWindowEnd: '2025-03-31', stayWindowStart: '2025-05-01', stayWindowEnd: '2025-10-31', isPrepaid: true, prepaymentPercentage: 50, applicationType: PricingModifierApplicationType.PER_NIGHT_PER_ROOM },
        ];
        const templateEbsCreated: TemplateEarlyBooking[] = [];
        for (const e of ebos) {
            const saved = await teService.createTemplateEarlyBooking(hotel.id, e as any);
            templateEbsCreated.push(saved);
            console.log(`  📅  ${saved.name}`);
        }

        // 8. Template SPO
        console.log('\n🎁 Catalogues Offres Spéciales:');
        const spos = [
            { name: 'Senior Discount 60+ (-10%)', conditionType: SpoConditionType.NONE, benefitType: SpoBenefitType.PERCENTAGE_DISCOUNT, benefitValue: 10, applicationType: PricingModifierApplicationType.PER_NIGHT_PER_PERSON },
            { name: 'Long Stay 21+ nights (-10%)', conditionType: SpoConditionType.LONG_STAY, conditionValue: 21, benefitType: SpoBenefitType.PERCENTAGE_DISCOUNT, benefitValue: 10, applicationType: PricingModifierApplicationType.FLAT_RATE_PER_STAY },
        ];
        const templateSposCreated: TemplateSpo[] = [];
        for (const spo of spos) {
            const saved = await tsSpoService.createTemplateSpo(hotel.id, spo as any);
            templateSposCreated.push(saved);
            console.log(`  🎁  ${saved.name}`);
        }

        // 9. Affiliates
        console.log('\n🤝 Affiliés (Partenaires):');
        const affiliate = await affiliateService.create(hotel.id, {
            companyName: 'Solférias',
            affiliateType: AffiliateType.TOUR_OPERATOR,
            emails: [{ label: 'Booking', address: 'dario.brilha@solferias.com' }],
            bankName: 'BIAT Bank (Agence Sousse Corniche) (28)',
            iban: 'TN 59 0830 3000 2810 0166 0795',
            swift: 'BIATTNTT',
            address: 'Rua Soeiro Gomes, Lote 1 – 1°B 1600-196 Lisboa Portugal',
            phone: '+351 21 799 53 30',
        });
        console.log(`  🤝  ${affiliate.companyName}`);

        // 10. Contract
        console.log('\n📄 Contrat Summer 2025:');
        const contract = await contractService.createContract(hotel.id, {
            name: 'Commercial Agreement Summer Season 2025',
            startDate: '2025-05-01',
            endDate: '2025-10-31',
            currency: 'EUR',
            affiliateIds: [affiliate.id],
            paymentCondition: PaymentConditionType.PREPAYMENT_100,
            depositAmount: 0,
            creditDays: 0,
            paymentMethods: [PaymentMethodType.BANK_TRANSFER],
            baseArrangementId: arrangementsCreated.find(a => a.code === 'ALL')?.id,
        });
        console.log(`  📄  ${contract.name}`);

        // 11. Import Rules into Contract
        console.log('\n📥 Importation des règles dans le contrat:');
        for (const t of templateSupplementsCreated) await app.get(ContractSupplementService).importFromTemplate(contract.id, t.id);
        for (const t of templateReductionsCreated) await app.get(ContractReductionService).importFromTemplate(contract.id, t.id, hotel.id);
        for (const t of templateMonoparentalsCreated) await app.get(ContractMonoparentalRuleService).importFromTemplate(contract.id, t.id, hotel.id);
        for (const t of templateEbsCreated) await app.get(ContractEarlyBookingService).importFromTemplate(contract.id, t.id, hotel.id);
        for (const t of templateSposCreated) await app.get(ContractSpoService).importFromTemplate(contract.id, { templateId: t.id });

        // 12. Setup Matrix Grid (Periods & Rooms)
        console.log('\n📅 Configuration de la Grille (Périodes & Chambres):');
        const periodsData = [
            { name: 'Period I', startDate: '2025-05-01', endDate: '2025-06-07' },
            { name: 'Period II', startDate: '2025-06-08', endDate: '2025-07-01' },
            { name: 'Period III', startDate: '2025-07-02', endDate: '2025-07-20' },
            { name: 'Period IV', startDate: '2025-07-21', endDate: '2025-08-31' },
            { name: 'Period V', startDate: '2025-09-01', endDate: '2025-09-29' },
            { name: 'Period VI', startDate: '2025-09-30', endDate: '2025-10-31' },
        ];
        const periodsCreated: any[] = [];
        for (const p of periodsData) {
            periodsCreated.push(await contractService.addPeriod(hotel.id, contract.id, { ...p, contractId: contract.id }));
        }

        const contractRoomsCreated: any[] = [];
        for (const rt of roomTypesCreated) {
            contractRoomsCreated.push(await contractService.addContractRoom(hotel.id, contract.id, { roomTypeId: rt.id, contractId: contract.id }));
        }

        // 13. Seed Prices (The Grid)
        console.log('\n💰 Injection de la Grille Tarifaire (All Inclusive per night per person):');
        // Rates mapping: [STD, PSV, SVM, SPSV, ESSV] x [P1, P2, P3, P4, P5, P6]
        const rates = [
            [72, 84, 96, 118, 93, 81],   // STD
            [78, 93, 102, 125, 99, 88],  // PSV
            [85, 102, 109, 132, 105, 95], // SVM
            [163, 163, 193, 193, 163, 163], // SPSV
            [179, 179, 225, 225, 179, 179], // ESSV
        ];

        const cells: any[] = [];
        for (let rIdx = 0; rIdx < contractRoomsCreated.length; rIdx++) {
            const roomCode = roomTypesCreated[rIdx].code;
            const allotment = roomCode === 'STD' ? 5 : roomCode === 'SPSV' || roomCode === 'ESSV' ? 1 : 5;

            for (let pIdx = 0; pIdx < periodsCreated.length; pIdx++) {
                cells.push({
                    periodId: periodsCreated[pIdx].id,
                    contractRoomId: contractRoomsCreated[rIdx].id,
                    isContracted: true,
                    allotment: allotment,
                    prices: [{
                        periodId: periodsCreated[pIdx].id,
                        contractRoomId: contractRoomsCreated[rIdx].id,
                        arrangementId: arrangementsCreated.find(a => a.code === 'ALL')!.id,
                        amount: rates[rIdx][pIdx],
                        minStay: 4,
                        releaseDays: 5
                    }]
                });
            }
        }
        await contractService.batchUpsertPrices(hotel.id, contract.id, { cells });
        console.log(`  ✅ ${cells.length} cellules tarifaires injectées.`);

        // 14. Users
        console.log('\n👤 Utilisateurs:');
        const bcrypt = await import('bcrypt');
        const hashedPw = await bcrypt.hash('commercial123', 10);
        const commUser = await usersService.createSeedAdmin({ email: 'commercial@marriott.com', firstName: 'Ahmed', lastName: 'Commercial', password: hashedPw, role: UserRole.COMMERCIAL });
        await usersService.update(commUser.id, { hotelIds: [hotel.id] });
        console.log(`  👤  Utilisateur COMMERCIAL: commercial@marriott.com / commercial123`);

        console.log('\n✅ Seed Marriott Sousse Summer 2025 terminé avec succès !');
        await app.close();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error seeding database:', error);
        process.exit(1);
    }
}

resetDb().catch(console.error);
