import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { Hotel } from '../hotel/entities/hotel.entity';
import { Plan } from '../plans/entities/plan.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { TenantUsageService } from './tenant-usage.service';

@Module({
    imports: [BillingModule, TypeOrmModule.forFeature([Subscription, Plan, Hotel, User, Tenant])],
    controllers: [SubscriptionsController],
    providers: [SubscriptionsService, TenantUsageService],
    exports: [SubscriptionsService, TenantUsageService],
})
export class SubscriptionsModule { }
