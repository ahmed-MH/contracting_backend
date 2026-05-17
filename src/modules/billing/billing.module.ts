import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { Plan } from '../plans/entities/plan.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PublicSignup } from './entities/public-signup.entity';
import { PublicOnboardingController } from './public-onboarding.controller';
import { PublicSignupsController } from './public-signups.controller';

@Module({
    imports: [ConfigModule, MailModule, TypeOrmModule.forFeature([Tenant, Plan, Subscription, PublicSignup, User])],
    controllers: [BillingController, PublicOnboardingController, PublicSignupsController],
    providers: [BillingService],
    exports: [BillingService],
})
export class BillingModule { }
