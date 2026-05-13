import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionStatus } from '../../common/constants/enums';
import { Hotel } from '../hotel/entities/hotel.entity';
import { Plan } from '../plans/entities/plan.entity';
import { User } from '../users/entities/user.entity';
import { UpdateSubscriptionStatusDto } from './dto/update-subscription-status.dto';
import { Subscription } from './entities/subscription.entity';

export interface SubscriptionRecord {
    id: number;
    tenantId: number;
    organizationName: string;
    planId: number;
    planName: string;
    monthlyRecurringRevenue: number;
    currency: string;
    status: SubscriptionStatus;
    renewalDate: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    hotelUsage: number;
    userUsage: number;
    note?: string;
}

export interface CreateSubscriptionSeedInput {
    tenantId: number;
    planId?: number;
    planName?: string;
    status?: SubscriptionStatus;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    monthlyPrice?: number;
    currency?: string;
    note?: string | null;
}

@Injectable()
export class SubscriptionsService {
    constructor(
        @InjectRepository(Subscription)
        private readonly subscriptionRepo: Repository<Subscription>,
        @InjectRepository(Plan)
        private readonly planRepo: Repository<Plan>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
    ) { }

    async findAll(): Promise<SubscriptionRecord[]> {
        const subscriptions = await this.subscriptionRepo.find({
            relations: ['tenant', 'plan'],
            order: { id: 'ASC' },
        });

        return Promise.all(subscriptions.map((subscription) => this.toRecord(subscription)));
    }

    async getSummary() {
        const subscriptions = await this.findAll();
        const currency = subscriptions[0]?.currency ?? 'USD';

        const activeMrr = subscriptions
            .filter((subscription) => subscription.status === SubscriptionStatus.ACTIVE)
            .reduce((total, subscription) => total + subscription.monthlyRecurringRevenue, 0);

        const atRiskMrr = subscriptions
            .filter((subscription) => subscription.status !== SubscriptionStatus.ACTIVE)
            .reduce((total, subscription) => total + subscription.monthlyRecurringRevenue, 0);

        return {
            totalSubscriptions: subscriptions.length,
            activeSubscriptions: subscriptions.filter((subscription) => subscription.status === SubscriptionStatus.ACTIVE).length,
            pastDueSubscriptions: subscriptions.filter((subscription) => subscription.status === SubscriptionStatus.PAST_DUE).length,
            suspendedSubscriptions: subscriptions.filter((subscription) => subscription.status === SubscriptionStatus.SUSPENDED).length,
            monthlyRecurringRevenue: activeMrr,
            atRiskMonthlyRecurringRevenue: atRiskMrr,
            currency,
        };
    }

    async updateStatus(id: number, dto: UpdateSubscriptionStatusDto): Promise<SubscriptionRecord> {
        if (!Object.values(SubscriptionStatus).includes(dto.status)) {
            throw new BadRequestException(`Invalid subscription status "${dto.status}"`);
        }

        const subscription = await this.subscriptionRepo.findOne({
            where: { id },
            relations: ['tenant', 'plan'],
        });
        if (!subscription) {
            throw new NotFoundException(`Subscription #${id} not found`);
        }

        subscription.status = dto.status;
        if (dto.renewalDate) {
            subscription.currentPeriodEnd = dto.renewalDate;
        }
        if (dto.reason !== undefined) {
            subscription.note = dto.reason;
        }

        return this.toRecord(await this.subscriptionRepo.save(subscription));
    }

    async createOrUpdateForTenant(input: CreateSubscriptionSeedInput): Promise<SubscriptionRecord> {
        const plan = await this.resolvePlan(input);
        const existing = await this.subscriptionRepo.findOne({
            where: { tenantId: input.tenantId },
            relations: ['tenant', 'plan'],
        });

        const subscription = existing ?? this.subscriptionRepo.create({ tenantId: input.tenantId });
        subscription.planId = plan.id;
        subscription.plan = plan;
        subscription.status = input.status ?? SubscriptionStatus.ACTIVE;
        subscription.currentPeriodStart = input.currentPeriodStart ?? subscription.currentPeriodStart ?? null;
        subscription.currentPeriodEnd = input.currentPeriodEnd ?? subscription.currentPeriodEnd ?? null;
        subscription.monthlyPrice = input.monthlyPrice ?? Number(plan.monthlyPrice);
        subscription.currency = input.currency ?? plan.currency;
        subscription.note = input.note ?? subscription.note ?? null;

        const saved = await this.subscriptionRepo.save(subscription);
        const hydrated = await this.subscriptionRepo.findOneOrFail({
            where: { id: saved.id },
            relations: ['tenant', 'plan'],
        });
        return this.toRecord(hydrated);
    }

    private async resolvePlan(input: CreateSubscriptionSeedInput): Promise<Plan> {
        if (input.planId !== undefined) {
            const plan = await this.planRepo.findOne({ where: { id: input.planId } });
            if (!plan) {
                throw new NotFoundException(`Plan #${input.planId} not found`);
            }
            return plan;
        }

        if (input.planName) {
            const plan = await this.planRepo.findOne({ where: { name: input.planName } });
            if (!plan) {
                throw new NotFoundException(`Plan "${input.planName}" not found`);
            }
            return plan;
        }

        throw new BadRequestException('A planId or planName is required to create a subscription.');
    }

    private async toRecord(subscription: Subscription): Promise<SubscriptionRecord> {
        const [hotelUsage, userUsage] = await Promise.all([
            this.hotelRepo.count({ where: { tenantId: subscription.tenantId } }),
            this.userRepo.count({ where: { tenantId: subscription.tenantId } }),
        ]);

        return {
            id: subscription.id,
            tenantId: subscription.tenantId,
            organizationName: subscription.tenant?.name ?? `Tenant #${subscription.tenantId}`,
            planId: subscription.planId,
            planName: subscription.plan?.name ?? `Plan #${subscription.planId}`,
            monthlyRecurringRevenue: Number(subscription.monthlyPrice),
            currency: subscription.currency,
            status: subscription.status,
            renewalDate: subscription.currentPeriodEnd ?? '',
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            hotelUsage,
            userUsage,
            note: subscription.note ?? undefined,
        };
    }
}
