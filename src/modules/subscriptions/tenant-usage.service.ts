import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { AuditLogCategory, AuditLogSeverity } from '../../common/audit/audit.types';
import { PlanBillingType, SubscriptionStatus, UserRole } from '../../common/constants/enums';
import { Hotel } from '../hotel/entities/hotel.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { Subscription } from './entities/subscription.entity';

export interface TenantUsageSnapshot {
    hasTenant: boolean;
    requiresOrganizationSetup: boolean;
    tenantId: number | null;
    tenantName: string | null;
    hasPlan: boolean;
    plan: {
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
    } | null;
    planName: string | null;
    billingStatus: SubscriptionStatus | 'NO_PLAN' | 'NO_ORGANIZATION';
    apiAccess: boolean;
    canUseApiAccess: boolean;
    users: {
        used: number | null;
        limit: number | null;
        active: number | null;
        pendingInvites: number | null;
    };
    hotels: {
        used: number | null;
        limit: number | null;
    };
}

@Injectable()
export class TenantUsageService {
    constructor(
        @InjectRepository(Subscription)
        private readonly subscriptionRepo: Repository<Subscription>,
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
        private readonly auditService: AuditService,
    ) { }

    getNoOrganizationUsage(): TenantUsageSnapshot {
        return {
            hasTenant: false,
            requiresOrganizationSetup: true,
            tenantId: null,
            tenantName: null,
            hasPlan: false,
            plan: null,
            planName: null,
            billingStatus: 'NO_ORGANIZATION',
            apiAccess: false,
            canUseApiAccess: false,
            users: {
                used: null,
                limit: null,
                active: null,
                pendingInvites: null,
            },
            hotels: {
                used: null,
                limit: null,
            },
        };
    }

    async getCurrentUserUsage(userId: number): Promise<TenantUsageSnapshot> {
        const user = await this.userRepo.findOne({ where: { id: userId }, relations: ['tenant'] });
        if (!user?.tenantId || !user.tenant) {
            return this.getNoOrganizationUsage();
        }

        return this.getTenantUsage(user.tenantId);
    }

    async getTenantUsage(tenantId: number): Promise<TenantUsageSnapshot> {
        const [tenant, subscription, activeUsers, pendingInvites, activeHotels] = await Promise.all([
            this.tenantRepo.findOne({ where: { id: tenantId } }),
            this.findCurrentSubscription(tenantId),
            this.countActiveTenantUsers(tenantId),
            this.countPendingInvites(tenantId),
            this.countActiveHotels(tenantId),
        ]);
        const plan = subscription?.plan ?? null;

        return {
            hasTenant: true,
            requiresOrganizationSetup: false,
            tenantId,
            tenantName: tenant?.name ?? `Tenant #${tenantId}`,
            hasPlan: Boolean(plan),
            plan: plan
                ? {
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
                }
                : null,
            planName: plan?.name ?? null,
            billingStatus: subscription?.status ?? 'NO_PLAN',
            apiAccess: Boolean(plan?.apiAccess),
            canUseApiAccess: Boolean(plan?.apiAccess && subscription?.status === SubscriptionStatus.ACTIVE),
            users: {
                active: activeUsers,
                pendingInvites,
                used: activeUsers + pendingInvites,
                limit: plan?.maxUsers ?? null,
            },
            hotels: {
                used: activeHotels,
                limit: plan?.maxHotels ?? null,
            },
        };
    }

    async assertCanInviteUser(tenantId: number, additionalUsers = 1): Promise<void> {
        const usage = await this.getTenantUsage(tenantId);
        if (!usage.hasPlan || usage.users.limit === null || usage.users.used === null) {
            await this.logEntitlementDenied('ENTITLEMENT_DENIED_NO_PLAN', tenantId, usage.tenantName, 'Invite blocked because no active plan is assigned');
            throw new ForbiddenException('No active plan is assigned to this tenant.');
        }
        if (usage.users.used + additionalUsers > usage.users.limit) {
            await this.logEntitlementDenied('ENTITLEMENT_DENIED_USER_LIMIT', tenantId, usage.tenantName, 'Invite blocked because the user limit was reached', {
                used: usage.users.used,
                limit: usage.users.limit,
                additionalUsers,
            });
            throw new ForbiddenException('User limit reached for current plan. Upgrade your plan or remove a pending invite.');
        }
    }

    async assertCanCreateHotel(tenantId: number, additionalHotels = 1): Promise<void> {
        const usage = await this.getTenantUsage(tenantId);
        if (!usage.hasPlan || usage.hotels.limit === null || usage.hotels.used === null) {
            await this.logEntitlementDenied('ENTITLEMENT_DENIED_NO_PLAN', tenantId, usage.tenantName, 'Hotel creation blocked because no active plan is assigned');
            throw new ForbiddenException('No active plan is assigned to this tenant.');
        }
        if (usage.hotels.used + additionalHotels > usage.hotels.limit) {
            await this.logEntitlementDenied('ENTITLEMENT_DENIED_HOTEL_LIMIT', tenantId, usage.tenantName, 'Hotel creation blocked because the hotel limit was reached', {
                used: usage.hotels.used,
                limit: usage.hotels.limit,
                additionalHotels,
            });
            throw new ForbiddenException('Hotel limit reached for current plan. Upgrade your plan to add more hotels.');
        }
    }

    async assertCanUseApiAccess(tenantId: number): Promise<void> {
        const subscription = await this.findActiveSubscription(tenantId);
        if (!subscription.plan.apiAccess) {
            await this.logEntitlementDenied(
                'ENTITLEMENT_DENIED_API_ACCESS',
                tenantId,
                subscription.tenant?.name ?? null,
                'API access blocked because the current plan does not include it',
                { planId: subscription.plan.id, planName: subscription.plan.name },
            );
            throw new ForbiddenException('API access is not included in the current plan. Upgrade your plan to use integrations.');
        }
    }

    private async findCurrentSubscription(tenantId: number): Promise<Subscription | null> {
        return this.subscriptionRepo.findOne({
            where: [
                { tenantId, status: SubscriptionStatus.ACTIVE },
                { tenantId, status: SubscriptionStatus.PAST_DUE },
            ],
            relations: ['plan'],
            order: { updatedAt: 'DESC' },
        });
    }

    private async findActiveSubscription(tenantId: number): Promise<Subscription> {
        const subscription = await this.subscriptionRepo.findOne({
            where: { tenantId, status: SubscriptionStatus.ACTIVE },
            relations: ['plan'],
            order: { updatedAt: 'DESC' },
        });

        if (!subscription?.plan) {
            await this.logEntitlementDenied('ENTITLEMENT_DENIED_NO_PLAN', tenantId, null, 'API access blocked because no active plan is assigned');
            throw new ForbiddenException('No active plan is assigned to this tenant.');
        }

        return subscription;
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

    private countActiveHotels(tenantId: number): Promise<number> {
        return this.hotelRepo.count({ where: { tenantId } });
    }

    private async logEntitlementDenied(
        eventType: string,
        tenantId: number,
        tenantName: string | null,
        message: string,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        await this.auditService.log({
            eventType,
            category: AuditLogCategory.ENTITLEMENT,
            severity: AuditLogSeverity.WARNING,
            message,
            tenantId,
            tenantName,
            targetType: 'tenant',
            targetId: tenantId,
            metadata,
        });
    }
}
