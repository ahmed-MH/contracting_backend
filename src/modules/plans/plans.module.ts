import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Plan } from './entities/plan.entity';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { PublicPlansController } from './public-plans.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Plan, Subscription])],
    controllers: [PlansController, PublicPlansController],
    providers: [PlansService],
    exports: [PlansService],
})
export class PlansModule { }
