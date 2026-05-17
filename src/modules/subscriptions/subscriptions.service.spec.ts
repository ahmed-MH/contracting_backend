import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { PlanBillingType, SubscriptionStatus, UserRole } from '../../common/constants/enums';
import { Hotel } from '../hotel/entities/hotel.entity';
import { Plan } from '../plans/entities/plan.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionsService } from './subscriptions.service';

function createCountQueryBuilder(count: number) {
    return {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(count),
    };
}

describe('SubscriptionsService', () => {
    let service: SubscriptionsService;

    const mockSubscriptionRepo = {
        find: jest.fn(),
        findOne: jest.fn(),
        findOneOrFail: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
    };

    const mockPlanRepo = {
        findOne: jest.fn(),
    };

    const mockTenantRepo = {
        findOne: jest.fn(),
    };

    const mockHotelRepo = {
        count: jest.fn(),
    };

    const mockUserRepo = {
        count: jest.fn(),
        createQueryBuilder: jest.fn(),
    };

    const mockAuditService = {
        log: jest.fn(),
        resolveActor: jest.fn().mockResolvedValue({ userId: null, email: null, role: 'SYSTEM', name: 'System' }),
    };

    const mockPlan = {
        id: 3,
        name: 'Enterprise',
        monthlyPrice: 18400,
        billingType: PlanBillingType.RECURRING,
        currency: 'USD',
    } as Plan;

    const mockSubscription = {
        id: 7,
        tenantId: 11,
        tenant: { id: 11, name: 'Marriott Tunisia' },
        planId: 3,
        plan: mockPlan,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: '2026-05-01',
        currentPeriodEnd: '2026-06-01',
        monthlyPrice: 18400,
        currency: 'USD',
        note: 'Demo subscription',
    } as Subscription;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SubscriptionsService,
                { provide: getRepositoryToken(Subscription), useValue: mockSubscriptionRepo },
                { provide: getRepositoryToken(Plan), useValue: mockPlanRepo },
                { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
                { provide: getRepositoryToken(Hotel), useValue: mockHotelRepo },
                { provide: getRepositoryToken(User), useValue: mockUserRepo },
                { provide: AuditService, useValue: mockAuditService },
            ],
        }).compile();

        service = module.get<SubscriptionsService>(SubscriptionsService);
        jest.clearAllMocks();
        mockHotelRepo.count.mockResolvedValue(2);
        let userCountCall = 0;
        mockUserRepo.createQueryBuilder.mockImplementation(() => {
            const count = userCountCall % 2 === 0 ? 5 : 0;
            userCountCall += 1;
            return createCountQueryBuilder(count);
        });
        mockSubscriptionRepo.create.mockImplementation((value) => value);
    });

    it('lists subscriptions in the public supervisor response shape', async () => {
        mockSubscriptionRepo.find.mockResolvedValue([mockSubscription]);

        const result = await service.findAll();

        expect(result).toEqual([{
            id: 7,
            tenantId: 11,
            organizationName: 'Marriott Tunisia',
            planId: 3,
            planName: 'Enterprise',
            billingType: PlanBillingType.RECURRING,
            monthlyRecurringRevenue: 18400,
            oneTimeRevenue: 0,
            currency: 'USD',
            status: SubscriptionStatus.ACTIVE,
            renewalDate: '2026-06-01',
            currentPeriodStart: '2026-05-01',
            currentPeriodEnd: '2026-06-01',
            hotelUsage: 2,
            userUsage: 5,
            note: 'Demo subscription',
        }]);
    });

    it('counts user usage as active tenant users plus pending uncanceled invites while excluding supervisors', async () => {
        const activeUsersQuery = createCountQueryBuilder(2);
        const pendingInvitesQuery = createCountQueryBuilder(1);
        mockUserRepo.createQueryBuilder
            .mockReturnValueOnce(activeUsersQuery)
            .mockReturnValueOnce(pendingInvitesQuery);
        mockSubscriptionRepo.find.mockResolvedValue([mockSubscription]);

        const [result] = await service.findAll();

        expect(result.userUsage).toBe(3);
        expect(activeUsersQuery.andWhere).toHaveBeenCalledWith('user.role != :supervisorRole', { supervisorRole: UserRole.SUPERVISOR });
        expect(activeUsersQuery.andWhere).toHaveBeenCalledWith('user.isActive = :isActive', { isActive: true });
        expect(pendingInvitesQuery.andWhere).toHaveBeenCalledWith('user.role != :supervisorRole', { supervisorRole: UserRole.SUPERVISOR });
        expect(pendingInvitesQuery.andWhere).toHaveBeenCalledWith('user.isActive = :isActive', { isActive: false });
        expect(pendingInvitesQuery.andWhere).toHaveBeenCalledWith('user.invitationToken IS NOT NULL');
        expect(pendingInvitesQuery.andWhere).toHaveBeenCalledWith('user.invitationCanceledAt IS NULL');
    });

    it('summarizes active and at-risk MRR from persisted subscriptions', async () => {
        mockSubscriptionRepo.find.mockResolvedValue([
            mockSubscription,
            {
                ...mockSubscription,
                id: 8,
                status: SubscriptionStatus.PAST_DUE,
                monthlyPrice: 6900,
            },
        ]);

        const result = await service.getSummary();

        expect(result).toEqual({
            totalSubscriptions: 2,
            activeSubscriptions: 1,
            pastDueSubscriptions: 1,
            suspendedSubscriptions: 0,
            monthlyRecurringRevenue: 18400,
            atRiskMonthlyRecurringRevenue: 6900,
            oneTimeRevenue: 0,
            currency: 'USD',
        });
    });

    it('excludes one-time active payments from MRR and reports one-time revenue separately', async () => {
        mockSubscriptionRepo.find.mockResolvedValue([
            mockSubscription,
            {
                ...mockSubscription,
                id: 8,
                plan: {
                    id: 4,
                    name: 'Launch',
                    billingType: PlanBillingType.ONE_TIME,
                    monthlyPrice: 1200,
                    currency: 'USD',
                },
                planId: 4,
                monthlyPrice: 1200,
            },
        ]);

        const [recurring, oneTime] = await service.findAll();
        const summary = await service.getSummary();

        expect(recurring.monthlyRecurringRevenue).toBe(18400);
        expect(oneTime.monthlyRecurringRevenue).toBe(0);
        expect(oneTime.oneTimeRevenue).toBe(1200);
        expect(summary).toEqual(expect.objectContaining({
            monthlyRecurringRevenue: 18400,
            oneTimeRevenue: 1200,
        }));
    });

    it('persists subscription status updates', async () => {
        mockSubscriptionRepo.findOne.mockResolvedValue({ ...mockSubscription });
        mockSubscriptionRepo.save.mockImplementation(async (subscription) => subscription);

        const result = await service.updateStatus(7, {
            status: SubscriptionStatus.SUSPENDED,
            reason: 'Payment failed',
            renewalDate: '2026-07-01',
        });

        expect(mockSubscriptionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            status: SubscriptionStatus.SUSPENDED,
            note: 'Payment failed',
            currentPeriodEnd: '2026-07-01',
        }));
        expect(result.status).toBe(SubscriptionStatus.SUSPENDED);
        expect(result.renewalDate).toBe('2026-07-01');
        expect(mockAuditService.log).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'SUBSCRIPTION_SUSPENDED',
            targetId: 7,
        }));
    });

    it('throws when updating a missing subscription', async () => {
        mockSubscriptionRepo.findOne.mockResolvedValue(null);

        await expect(service.updateStatus(999, { status: SubscriptionStatus.ACTIVE }))
            .rejects.toThrow(NotFoundException);
    });

    it('assigns an active plan to a tenant without a subscription as past due', async () => {
        const tenant = { id: 22, name: 'Recovery Tenant' } as Tenant;
        const plan = {
            id: 4,
            name: 'Plus',
            monthlyPrice: 1200,
            billingType: PlanBillingType.ONE_TIME,
            currency: 'USD',
            isActive: true,
        } as Plan;
        const savedSubscription = {
            id: 44,
            tenantId: tenant.id,
            tenant,
            planId: plan.id,
            plan,
            status: SubscriptionStatus.PAST_DUE,
            currentPeriodStart: '2026-05-14',
            currentPeriodEnd: null,
            monthlyPrice: 1200,
            currency: 'USD',
            note: 'Plan assigned by supervisor. Payment collection may still be required.',
        } as Subscription;

        mockTenantRepo.findOne.mockResolvedValue(tenant);
        mockPlanRepo.findOne.mockResolvedValue(plan);
        mockSubscriptionRepo.findOne.mockResolvedValueOnce(null);
        mockSubscriptionRepo.save.mockResolvedValue({ id: 44 });
        mockSubscriptionRepo.findOneOrFail.mockResolvedValue(savedSubscription);

        const result = await service.assignPlan({ tenantId: tenant.id, planId: plan.id });

        expect(mockSubscriptionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: tenant.id,
            planId: plan.id,
            status: SubscriptionStatus.PAST_DUE,
            monthlyPrice: 1200,
            currency: 'USD',
        }));
        expect(result.status).toBe(SubscriptionStatus.PAST_DUE);
        expect(result.planName).toBe('Plus');
        expect(mockAuditService.log).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'TENANT_PLAN_ASSIGNED',
            tenantId: tenant.id,
        }));
    });

    it('changes an existing subscription plan safely as past due by default', async () => {
        const tenant = { id: 11, name: 'Marriott Tunisia' } as Tenant;
        const newPlan = {
            id: 5,
            name: 'Recovery Pro',
            monthlyPrice: 4200,
            billingType: PlanBillingType.RECURRING,
            currency: 'USD',
            isActive: true,
        } as Plan;
        const existing = { ...mockSubscription, tenant, status: SubscriptionStatus.ACTIVE } as Subscription;
        const saved = {
            ...existing,
            planId: newPlan.id,
            plan: newPlan,
            status: SubscriptionStatus.PAST_DUE,
            monthlyPrice: 4200,
            currentPeriodEnd: null,
            note: 'Plan assigned by supervisor. Payment collection may still be required.',
        } as Subscription;

        mockTenantRepo.findOne.mockResolvedValue(tenant);
        mockPlanRepo.findOne.mockResolvedValue(newPlan);
        mockSubscriptionRepo.findOne.mockResolvedValueOnce(existing);
        mockSubscriptionRepo.save.mockResolvedValue({ id: existing.id });
        mockSubscriptionRepo.findOneOrFail.mockResolvedValue(saved);

        const result = await service.assignPlan({ tenantId: tenant.id, planId: newPlan.id });

        expect(mockSubscriptionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            id: existing.id,
            planId: newPlan.id,
            status: SubscriptionStatus.PAST_DUE,
            monthlyPrice: 4200,
        }));
        expect(result.planId).toBe(newPlan.id);
        expect(result.status).toBe(SubscriptionStatus.PAST_DUE);
    });

    it('rejects assigning a missing tenant', async () => {
        mockTenantRepo.findOne.mockResolvedValue(null);

        await expect(service.assignPlan({ tenantId: 999, planId: 1 }))
            .rejects.toThrow(NotFoundException);
    });

    it('rejects assigning an inactive plan', async () => {
        mockTenantRepo.findOne.mockResolvedValue({ id: 11, name: 'Marriott Tunisia' });
        mockPlanRepo.findOne.mockResolvedValue({ id: 3, name: 'Inactive', isActive: false });

        await expect(service.assignPlan({ tenantId: 11, planId: 3 }))
            .rejects.toThrow(BadRequestException);
    });
});
