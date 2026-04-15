import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// --- CORE ---
import { Contract } from './core/entities/contract.entity';
import { Period } from './core/entities/period.entity';
import { ContractRoom } from './core/entities/contract-room.entity';
import { ContractService } from './core/contract.service';
import { ContractPdfService } from './core/contract-pdf.service';
import { ContractExportPresentationService } from './core/contract-export-presentation.service';
import { ContractController } from './core/contract.controller';
import { ContractLine } from './core/entities/contract-line.entity';
import { Price } from './core/entities/price.entity';
import { ContractExportSnapshot } from './core/entities/contract-export-snapshot.entity';

// --- SUPPLEMENT ---
import { ContractSupplement } from './supplement/entities/contract-supplement.entity';
import { ContractSupplementRoom } from './supplement/entities/contract-supplement-room.entity';
import { ContractSupplementPeriod } from './supplement/entities/contract-supplement-period.entity';
import { ContractSupplementService } from './supplement/contract-supplement.service';
import { ContractSupplementController } from './supplement/contract-supplement.controller';

// --- REDUCTION ---
import { ContractReduction } from './reduction/entities/contract-reduction.entity';
import { ContractReductionRoom } from './reduction/entities/contract-reduction-room.entity';
import { ContractReductionPeriod } from './reduction/entities/contract-reduction-period.entity';
import { ContractReductionService } from './reduction/contract-reduction.service';
import { ContractReductionController } from './reduction/contract-reduction.controller';

// --- MONOPARENTAL RULE ---
import { ContractMonoparentalRule } from './monoparental/entities/contract-monoparental-rule.entity';
import { ContractMonoparentalRuleRoom } from './monoparental/entities/contract-monoparental-rule-room.entity';
import { ContractMonoparentalRulePeriod } from './monoparental/entities/contract-monoparental-rule-period.entity';
import { ContractMonoparentalRuleService } from './monoparental/contract-monoparental-rule.service';
import { ContractMonoparentalRuleController } from './monoparental/contract-monoparental-rule.controller';

// --- EARLY BOOKING ---
import { ContractEarlyBooking } from './early-booking/entities/contract-early-booking.entity';
import { ContractEarlyBookingRoom } from './early-booking/entities/contract-early-booking-room.entity';
import { ContractEarlyBookingPeriod } from './early-booking/entities/contract-early-booking-period.entity';
import { ContractEarlyBookingService } from './early-booking/contract-early-booking.service';
import { ContractEarlyBookingController } from './early-booking/contract-early-booking.controller';

// --- SPO ---
import { ContractSpo } from './spo/entities/contract-spo.entity';
import { ContractSpoPeriod } from './spo/entities/contract-spo-period.entity';
import { ContractSpoRoom } from './spo/entities/contract-spo-room.entity';
import { ContractSpoArrangement } from './spo/entities/contract-spo-arrangement.entity';
import { ContractSpoService } from './spo/contract-spo.service';
import { ContractSpoController } from './spo/contract-spo.controller';

// --- CANCELLATION ---
import { ContractCancellationRule } from './cancellation/entities/contract-cancellation-rule.entity';
import { ContractCancellationRulePeriod } from './cancellation/entities/contract-cancellation-rule-period.entity';
import { ContractCancellationRuleRoom } from './cancellation/entities/contract-cancellation-rule-room.entity';
import { ContractCancellationService } from './cancellation/contract-cancellation.service';
import { ContractCancellationController } from './cancellation/contract-cancellation.controller';

// --- Cross-module entities ---
import { Affiliate } from '../affiliate/entities/affiliate.entity';
import { RoomType } from '../hotel/entities/room-type.entity';
import { Hotel } from '../hotel/entities/hotel.entity';
import { ExchangeRate } from '../exchange-rates/entities/exchange-rate.entity';
import { Arrangement } from '../hotel/entities/arrangement.entity';
import { TemplateSupplement } from '../catalog/supplement/entities/template-supplement.entity';
import { TemplateReduction } from '../catalog/reduction/entities/template-reduction.entity';
import { TemplateMonoparentalRule } from '../catalog/monoparental/entities/template-monoparental-rule.entity';
import { TemplateEarlyBooking } from '../catalog/early-booking/entities/template-early-booking.entity';
import { TemplateSpo } from '../catalog/spo/entities/template-spo.entity';
import { TemplateCancellationRule } from '../catalog/cancellation/entities/template-cancellation-rule.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Contract,
            Period,
            ContractRoom,
            ContractLine,
            Price,
            ContractExportSnapshot,
            ContractSupplement,
            ContractSupplementRoom,
            ContractSupplementPeriod,
            ContractReduction,
            ContractReductionRoom,
            ContractReductionPeriod,
            ContractMonoparentalRule,
            ContractMonoparentalRuleRoom,
            ContractMonoparentalRulePeriod,
            ContractEarlyBooking,
            ContractEarlyBookingRoom,
            ContractEarlyBookingPeriod,
            ContractSpo,
            ContractSpoPeriod,
            ContractSpoRoom,
            ContractSpoArrangement,
            ContractCancellationRule,
            ContractCancellationRulePeriod,
            ContractCancellationRuleRoom,

            // External
            Affiliate,
            RoomType,
            Hotel,
            ExchangeRate,
            Arrangement,
            TemplateSupplement,
            TemplateReduction,
            TemplateMonoparentalRule,
            TemplateEarlyBooking,
            TemplateSpo,
            TemplateCancellationRule,
        ]),
    ],
    controllers: [
        ContractController,
        ContractSupplementController,
        ContractReductionController,
        ContractMonoparentalRuleController,
        ContractEarlyBookingController,
        ContractSpoController,
        ContractCancellationController,
    ],
    providers: [
        ContractService,
        ContractPdfService,
        ContractExportPresentationService,
        ContractSupplementService,
        ContractReductionService,
        ContractMonoparentalRuleService,
        ContractEarlyBookingService,
        ContractSpoService,
        ContractCancellationService,
    ],
    exports: [
        ContractService,
        ContractSupplementService,
        ContractReductionService,
        ContractMonoparentalRuleService,
        ContractEarlyBookingService,
        ContractSpoService,
        ContractCancellationService,
    ],
})
export class ContractModule { }
