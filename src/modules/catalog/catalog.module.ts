import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ─── Supplement ──────────────────────────────────────────────────────
import { TemplateSupplement } from './supplement/entities/template-supplement.entity';
import { TemplateSupplementController } from './supplement/template-supplement.controller';
import { TemplateSupplementService } from './supplement/template-supplement.service';

// ─── Reduction ───────────────────────────────────────────────────────
import { TemplateReduction } from './reduction/entities/template-reduction.entity';
import { TemplateReductionController } from './reduction/template-reduction.controller';
import { TemplateReductionService } from './reduction/template-reduction.service';

// ─── Monoparental Rule ───────────────────────────────────────────────
import { TemplateMonoparentalRule } from './monoparental/entities/template-monoparental-rule.entity';
import { TemplateMonoparentalRuleController } from './monoparental/template-monoparental-rule.controller';
import { TemplateMonoparentalRuleService } from './monoparental/template-monoparental-rule.service';

// ─── Early Booking ───────────────────────────────────────────────────
import { TemplateEarlyBooking } from './early-booking/entities/template-early-booking.entity';
import { TemplateEarlyBookingController } from './early-booking/template-early-booking.controller';
import { TemplateEarlyBookingService } from './early-booking/template-early-booking.service';

// ─── SPO ─────────────────────────────────────────────────────────────
import { TemplateSpo } from './spo/entities/template-spo.entity';
import { TemplateSpoController } from './spo/template-spo.controller';
import { TemplateSpoService } from './spo/template-spo.service';

// ─── Cancellation Rule ──────────────────────────────────────────────
import { TemplateCancellationRule } from './cancellation/entities/template-cancellation-rule.entity';
import { TemplateCancellationController } from './cancellation/template-cancellation.controller';
import { TemplateCancellationService } from './cancellation/template-cancellation.service';

// ─── Cross-module entities (for TypeORM injection) ───────────────────
import { Hotel } from '../hotel/entities/hotel.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            TemplateSupplement,
            TemplateReduction,
            TemplateMonoparentalRule,
            TemplateEarlyBooking,
            TemplateSpo,
            TemplateCancellationRule,
            Hotel,
        ]),
    ],
    controllers: [
        TemplateSupplementController,
        TemplateReductionController,
        TemplateMonoparentalRuleController,
        TemplateEarlyBookingController,
        TemplateSpoController,
        TemplateCancellationController,
    ],
    providers: [
        TemplateSupplementService,
        TemplateReductionService,
        TemplateMonoparentalRuleService,
        TemplateEarlyBookingService,
        TemplateSpoService,
        TemplateCancellationService,
    ],
    exports: [
        TemplateSupplementService,
        TemplateReductionService,
        TemplateMonoparentalRuleService,
        TemplateEarlyBookingService,
        TemplateSpoService,
        TemplateCancellationService,
    ],
})
export class CatalogModule { }
