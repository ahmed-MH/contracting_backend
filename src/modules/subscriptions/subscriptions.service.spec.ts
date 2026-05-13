import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SubscriptionStatus } from '../../common/constants/enums';
import { Hotel } from '../hotel/entities/hotel.entity';
import { Plan } from '../plans/entities/plan.entity';
import { User } from '../users/entities/user.entity';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionsService } from './subscriptions.service';

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

    const mockHotelRepo = {
        count: jest.fn(),
    };

    const mockUserRepo = {
        count: jest.fn(),
    };

    const mockPlan = {
        id: 3,
        name: 'Enterprise',
        monthlyPrice: 18400,
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
                { provide: getRepositoryToken(Hotel), useValue: mockHotelRepo },
                { provide: getRepositoryToken(User), useValue: mockUserRepo },
            ],
        }).compile();

        service = module.get<SubscriptionsService>(SubscriptionsService);
        jest.clearAllMocks();
        mockHotelRepo.count.mockResolvedValue(2);
        mockUserRepo.count.mockResolvedValue(5);
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
            monthlyRecurringRevenue: 18400,
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
            currency: 'USD',
        });
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
    });

    it('throws when updating a missing subscription', async () => {
        mockSubscriptionRepo.findOne.mockResolvedValue(null);

        await expect(service.updateStatus(999, { status: SubscriptionStatus.ACTIVE }))
            .rejects.toThrow(NotFoundException);
    });
});
