import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { AuditLogCategory, AuditLogSeverity } from '../../common/audit/audit.types';
import { PlanBillingType, SubscriptionStatus, UserRole } from '../../common/constants/enums';
import { RequestUser } from '../../common/interfaces/request.interface';
import { Hotel } from '../hotel/entities/hotel.entity';
import { Plan } from '../plans/entities/plan.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { AssignPlanDto } from './dto/assign-plan.dto';
import { UpdateSubscriptionStatusDto } from './dto/update-subscription-status.dto';
import { Subscription } from './entities/subscription.entity';

export interface SubscriptionRecord {
    id: number;
    tenantId: number;
    organizationName: string;
    planId: number;
    planName: string;
    billingType: PlanBillingType;
    monthlyRecurringRevenue: number;
    oneTimeRevenue: number;
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

export interface AvailablePlanRecord {
    id: number;
    name: string;
    description: string;
    billingType: PlanBillingType;
    monthlyPrice: number;
    currency: string;
    maxHotels: number;
    maxUsers: number;
    apiAccess: boolean;
    supportTier: string;
    features: string[];
    canSubscribe: boolean;
}

@Injectable()
export class SubscriptionsService {
    constructor(
        @InjectRepository(Subscription)
        private readonly subscriptionRepo: Repository<Subscription>,
        @InjectRepository(Plan)
        private readonly planRepo: Repository<Plan>,
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        private readonly auditService: AuditService,
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

        const oneTimeRevenue = subscriptions
            .filter((subscription) => subscription.status === SubscriptionStatus.ACTIVE)
            .reduce((total, subscription) => total + subscription.oneTimeRevenue, 0);

        return {
            totalSubscriptions: subscriptions.length,
            activeSubscriptions: subscriptions.filter((subscription) => subscription.status === SubscriptionStatus.ACTIVE).length,
            pastDueSubscriptions: subscriptions.filter((subscription) => subscription.status === SubscriptionStatus.PAST_DUE).length,
            suspendedSubscriptions: subscriptions.filter((subscription) => subscription.status === SubscriptionStatus.SUSPENDED).length,
            monthlyRecurringRevenue: activeMrr,
            atRiskMonthlyRecurringRevenue: atRiskMrr,
            oneTimeRevenue,
            currency,
        };
    }

    async findAvailablePlans(): Promise<AvailablePlanRecord[]> {
        const plans = await this.planRepo.find({
            where: { isActive: true },
            order: { monthlyPrice: 'ASC', id: 'ASC' },
        });

        return plans.map((plan) => ({
            id: plan.id,
            name: plan.name,
            description: plan.description,
            billingType: plan.billingType ?? PlanBillingType.RECURRING,
            monthlyPrice: Number(plan.monthlyPrice),
            currency: plan.currency,
            maxHotels: plan.maxHotels,
            maxUsers: plan.maxUsers,
            apiAccess: plan.apiAccess,
            supportTier: plan.supportTier,
            features: plan.features ?? [],
            canSubscribe: Boolean(plan.stripePriceId),
        }));
    }

    async updateStatus(id: number, dto: UpdateSubscriptionStatusDto, currentUser?: RequestUser): Promise<SubscriptionRecord> {
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

        const saved = await this.subscriptionRepo.save(subscription);
        await this.auditService.log({
            eventType: this.subscriptionStatusEventType(saved.status),
            category: AuditLogCategory.SUBSCRIPTION,
            severity: saved.status === SubscriptionStatus.ACTIVE ? AuditLogSeverity.INFO : AuditLogSeverity.WARNING,
            message: `Subscription for ${saved.tenant?.name ?? `tenant #${saved.tenantId}`} was marked ${saved.status}`,
            actor: await this.auditService.resolveActor(currentUser),
            tenantId: saved.tenantId,
            tenantName: saved.tenant?.name ?? null,
            targetType: 'subscription',
            targetId: saved.id,
            metadata: { status: saved.status, reason: dto.reason ?? null },
        });
        return this.toRecord(saved);
    }

    async assignPlan(dto: AssignPlanDto, currentUser?: RequestUser): Promise<SubscriptionRecord> {
        const tenant = await this.tenantRepo.findOne({ where: { id: dto.tenantId } });
        if (!tenant) {
            throw new NotFoundException(`Tenant #${dto.tenantId} not found`);
        }

        const plan = await this.planRepo.findOne({ where: { id: dto.planId } });
        if (!plan) {
            throw new NotFoundException(`Plan #${dto.planId} not found`);
        }
        if (!plan.isActive) {
            throw new BadRequestException(`Plan "${plan.name}" is not active`);
        }

        const existing = await this.subscriptionRepo.findOne({
            where: { tenantId: tenant.id },
            relations: ['tenant', 'plan'],
        });

        const subscription = existing ?? this.subscriptionRepo.create({ tenantId: tenant.id, tenant });
        subscription.tenant = tenant;
        subscription.tenantId = tenant.id;
        subscription.plan = plan;
        subscription.planId = plan.id;
        subscription.status = dto.status ?? SubscriptionStatus.PAST_DUE;
        subscription.currentPeriodStart = subscription.currentPeriodStart ?? this.toDateOnly(new Date());
        subscription.currentPeriodEnd = null;
        subscription.monthlyPrice = Number(plan.monthlyPrice);
        subscription.currency = plan.currency;
        subscription.note = 'Plan assigned by supervisor. Payment collection may still be required.';

        const saved = await this.subscriptionRepo.save(subscription);
        const hydrated = await this.subscriptionRepo.findOneOrFail({
            where: { id: saved.id },
            relations: ['tenant', 'plan'],
        });
        await this.auditService.log({
            eventType: 'TENANT_PLAN_ASSIGNED',
            category: AuditLogCategory.SUBSCRIPTION,
            severity: AuditLogSeverity.WARNING,
            message: `Plan ${plan.name} was assigned to tenant ${tenant.name}`,
            actor: await this.auditService.resolveActor(currentUser),
            tenantId: tenant.id,
            tenantName: tenant.name,
            targetType: 'subscription',
            targetId: hydrated.id,
            metadata: {
                planId: plan.id,
                planName: plan.name,
                status: hydrated.status,
                billingType: plan.billingType,
            },
        });
        return this.toRecord(hydrated);
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

    private toDateOnly(date: Date): string {
        return date.toISOString().slice(0, 10);
    }

    private subscriptionStatusEventType(status: SubscriptionStatus): string {
        if (status === SubscriptionStatus.ACTIVE) return 'SUBSCRIPTION_ACTIVATED';
        if (status === SubscriptionStatus.PAST_DUE) return 'SUBSCRIPTION_MARKED_PAST_DUE';
        return 'SUBSCRIPTION_SUSPENDED';
    }

    private async toRecord(subscription: Subscription): Promise<SubscriptionRecord> {
        const [hotelUsage, activeUsers, pendingInvites] = await Promise.all([
            this.hotelRepo.count({ where: { tenantId: subscription.tenantId } }),
            this.countActiveTenantUsers(subscription.tenantId),
            this.countPendingInvites(subscription.tenantId),
        ]);
        const userUsage = activeUsers + pendingInvites;

        const billingType = subscription.plan?.billingType ?? PlanBillingType.RECURRING;
        const amount = Number(subscription.monthlyPrice);

        return {
            id: subscription.id,
            tenantId: subscription.tenantId,
            organizationName: subscription.tenant?.name ?? `Tenant #${subscription.tenantId}`,
            planId: subscription.planId,
            planName: subscription.plan?.name ?? `Plan #${subscription.planId}`,
            billingType,
            monthlyRecurringRevenue: billingType === PlanBillingType.RECURRING ? amount : 0,
            oneTimeRevenue: billingType === PlanBillingType.ONE_TIME ? amount : 0,
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

    private countActiveTenantUsers(tenantId: number): Promise<number> {
        return this.userRepo
            .createQueryBuilder('user')
            .where('user.tenantId = :tenantId', { tenantId })
            .andWhere('user.role != :supervisorRole', { supervisorRole: UserRole.SUPERVISOR })
            .andWhere('user.isActive = :isActive', { isActive: true })
            .getCount();
    }

    private countPendingInvites(tenantId: number): Promise<number> {
        return this.userRepo
            .createQueryBuilder('user')
            .where('user.tenantId = :tenantId', { tenantId })
            .andWhere('user.role != :supervisorRole', { supervisorRole: UserRole.SUPERVISOR })
            .andWhere('user.isActive = :isActive', { isActive: false })
            .andWhere('user.invitationToken IS NOT NULL')
            .andWhere('user.invitationCanceledAt IS NULL')
            .getCount();
    }
}
