import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { SubscriptionStatus, UserRole } from '../../common/constants/enums';
import { Hotel } from '../hotel/entities/hotel.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { Subscription } from './entities/subscription.entity';
import { TenantUsageService } from './tenant-usage.service';

function createCountQueryBuilder(count: number) {
    return {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(count),
    };
}

describe('TenantUsageService', () => {
    let service: TenantUsageService;

    const plusSubscription = {
        id: 1,
        tenantId: 10,
        status: SubscriptionStatus.ACTIVE,
        plan: {
            id: 2,
            name: 'Plus',
            description: 'Starter plan',
            billingType: 'RECURRING',
            monthlyPrice: 30,
            currency: 'USD',
            maxUsers: 2,
            maxHotels: 1,
            apiAccess: false,
            supportTier: 'Standard',
            features: ['Core access'],
        },
    } as Subscription;

    const subscriptionRepo = {
        findOne: jest.fn(),
    };

    const tenantRepo = {
        findOne: jest.fn(),
    };

    const userRepo = {
        createQueryBuilder: jest.fn(),
    };

    const hotelRepo = {
        count: jest.fn(),
    };

    const auditService = {
        log: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TenantUsageService,
                { provide: getRepositoryToken(Subscription), useValue: subscriptionRepo },
                { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
                { provide: getRepositoryToken(User), useValue: userRepo },
                { provide: getRepositoryToken(Hotel), useValue: hotelRepo },
                { provide: AuditService, useValue: auditService },
            ],
        }).compile();

        service = module.get<TenantUsageService>(TenantUsageService);
        jest.clearAllMocks();
        subscriptionRepo.findOne.mockResolvedValue(plusSubscription);
        tenantRepo.findOne.mockResolvedValue({ id: 10, name: 'Demo Tenant' });
        hotelRepo.count.mockResolvedValue(0);
    });

    it('counts active tenant users, pending invites, and excludes supervisors from seat usage', async () => {
        userRepo.createQueryBuilder
            .mockReturnValueOnce(createCountQueryBuilder(1))
            .mockReturnValueOnce(createCountQueryBuilder(1));
        hotelRepo.count.mockResolvedValue(1);

        const usage = await service.getTenantUsage(10);

        expect(usage).toEqual({
            hasTenant: true,
            requiresOrganizationSetup: false,
            tenantId: 10,
            tenantName: 'Demo Tenant',
            hasPlan: true,
            plan: {
                id: 2,
                name: 'Plus',
                description: 'Starter plan',
                billingType: 'RECURRING',
                monthlyPrice: 30,
                currency: 'USD',
                maxHotels: 1,
                maxUsers: 2,
                apiAccess: false,
                supportTier: 'Standard',
                features: ['Core access'],
            },
            planName: 'Plus',
            billingStatus: SubscriptionStatus.ACTIVE,
            apiAccess: false,
            canUseApiAccess: false,
            users: {
                active: 1,
                pendingInvites: 1,
                used: 2,
                limit: 2,
            },
            hotels: {
                used: 1,
                limit: 1,
            },
        });
        expect(userRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
        expect(hotelRepo.count).toHaveBeenCalledWith({ where: { tenantId: 10 } });
    });

    it('blocks COMMERCIAL or AGENT invites when active admin plus pending invite reaches maxUsers', async () => {
        userRepo.createQueryBuilder
            .mockReturnValueOnce(createCountQueryBuilder(1))
            .mockReturnValueOnce(createCountQueryBuilder(1));

        await expect(service.assertCanInviteUser(10))
            .rejects
            .toThrow(ForbiddenException);
    });

    it('allows one invite when a Plus tenant only has the active ADMIN seat used', async () => {
        userRepo.createQueryBuilder
            .mockReturnValueOnce(createCountQueryBuilder(1))
            .mockReturnValueOnce(createCountQueryBuilder(0));

        await expect(service.assertCanInviteUser(10)).resolves.toBeUndefined();
    });

    it('blocks the second active hotel for a Plus tenant', async () => {
        userRepo.createQueryBuilder
            .mockReturnValueOnce(createCountQueryBuilder(1))
            .mockReturnValueOnce(createCountQueryBuilder(0));
        hotelRepo.count.mockResolvedValue(1);

        await expect(service.assertCanCreateHotel(10))
            .rejects
            .toThrow(ForbiddenException);
    });

    it('returns a no-plan snapshot when no usable active or past-due plan exists', async () => {
        subscriptionRepo.findOne.mockResolvedValue(null);
        userRepo.createQueryBuilder
            .mockReturnValueOnce(createCountQueryBuilder(1))
            .mockReturnValueOnce(createCountQueryBuilder(0));

        const usage = await service.getTenantUsage(10);

        expect(usage).toEqual(expect.objectContaining({
            hasTenant: true,
            requiresOrganizationSetup: false,
            hasPlan: false,
            plan: null,
            planName: null,
            billingStatus: 'NO_PLAN',
            apiAccess: false,
            canUseApiAccess: false,
            users: expect.objectContaining({ used: 1, limit: null }),
            hotels: expect.objectContaining({ limit: null }),
        }));
    });

    it('returns a no-organization snapshot without touching tenant usage counters', () => {
        const usage = service.getNoOrganizationUsage();

        expect(usage).toEqual({
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
        });
        expect(subscriptionRepo.findOne).not.toHaveBeenCalled();
        expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
        expect(hotelRepo.count).not.toHaveBeenCalled();
    });

    it('blocks invitations when no usable active or past-due plan exists', async () => {
        subscriptionRepo.findOne.mockResolvedValue(null);
        userRepo.createQueryBuilder
            .mockReturnValueOnce(createCountQueryBuilder(1))
            .mockReturnValueOnce(createCountQueryBuilder(0));

        await expect(service.assertCanInviteUser(10))
            .rejects
            .toThrow('No active plan is assigned to this tenant.');
    });

    it('blocks integration API access when the current plan does not include it', async () => {
        await expect(service.assertCanUseApiAccess(10))
            .rejects
            .toThrow('API access is not included in the current plan.');
    });

    it('allows integration API access when the current plan includes it', async () => {
        subscriptionRepo.findOne.mockResolvedValue({
            ...plusSubscription,
            plan: {
                ...plusSubscription.plan,
                apiAccess: true,
            },
        });

        await expect(service.assertCanUseApiAccess(10)).resolves.toBeUndefined();
    });

    it('applies tenant role filtering and pending invite filtering in count queries', async () => {
        const activeUsersQuery = createCountQueryBuilder(1);
        const pendingInvitesQuery = createCountQueryBuilder(0);
        userRepo.createQueryBuilder
            .mockReturnValueOnce(activeUsersQuery)
            .mockReturnValueOnce(pendingInvitesQuery);

        await service.getTenantUsage(10);

        expect(activeUsersQuery.andWhere).toHaveBeenCalledWith('user.role != :supervisorRole', { supervisorRole: UserRole.SUPERVISOR });
        expect(activeUsersQuery.andWhere).toHaveBeenCalledWith('user.isActive = :isActive', { isActive: true });
        expect(pendingInvitesQuery.andWhere).toHaveBeenCalledWith('user.isActive = :isActive', { isActive: false });
        expect(pendingInvitesQuery.andWhere).toHaveBeenCalledWith('user.invitationToken IS NOT NULL');
        expect(pendingInvitesQuery.andWhere).toHaveBeenCalledWith('user.invitationCanceledAt IS NULL');
    });
});
