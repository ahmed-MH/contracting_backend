import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SimulationService } from './simulation.service';
import { SimulationController } from './simulation.controller';
import { SimulationContractMatcherService } from './simulation-contract-matcher.service';
import { PricingEngineService } from './pricing-engine.service';
import { Contract } from '../contract/core/entities/contract.entity';
import { ContractLine } from '../contract/core/entities/contract-line.entity';
import { ContractReduction } from '../contract/reduction/entities/contract-reduction.entity';
import { ContractMonoparentalRule } from '../contract/monoparental/entities/contract-monoparental-rule.entity';
import { ContractEarlyBooking } from '../contract/early-booking/entities/contract-early-booking.entity';
import { ContractSpo } from '../contract/spo/entities/contract-spo.entity';
import { ContractSupplement } from '../contract/supplement/entities/contract-supplement.entity';
import { AffiliateEmailSpo } from '../affiliate/email-spo/entities/affiliate-email-spo.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Contract,
            ContractLine,
            ContractReduction,
            ContractMonoparentalRule,
            ContractEarlyBooking,
            ContractSpo,
            ContractSupplement,
            AffiliateEmailSpo,
        ]),
    ],
    controllers: [SimulationController],
    providers: [SimulationService, SimulationContractMatcherService, PricingEngineService],
    exports: [SimulationService, SimulationContractMatcherService, PricingEngineService],
})
export class SimulationModule { }
