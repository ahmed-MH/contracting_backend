import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlanBillingType, SubscriptionStatus } from '../../common/constants/enums';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Plan } from './entities/plan.entity';
import { PlansService } from './plans.service';

describe('PlansService', () => {
    let service: PlansService;

    const mockPlanRepo = {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
    };

    const mockSubscriptionRepo = {
        count: jest.fn(),
    };

    const mockPlan = {
        id: 2,
        name: 'Pro',
        description: 'Growth tier',
        monthlyPrice: 499,
        billingType: PlanBillingType.RECURRING,
        currency: 'USD',
        maxHotels: 10,
        maxUsers: 50,
        apiAccess: true,
        supportTier: 'Priority',
        features: ['API access'],
        isActive: true,
        stripeProductId: null,
        stripePriceId: null,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    } as Plan;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PlansService,
                { provide: getRepositoryToken(Plan), useValue: mockPlanRepo },
                { provide: getRepositoryToken(Subscription), useValue: mockSubscriptionRepo },
            ],
        }).compile();

        service = module.get<PlansService>(PlansService);
        jest.clearAllMocks();
    });

    it('maps persisted plans to the public record shape', async () => {
        mockPlanRepo.find.mockResolvedValue([mockPlan]);

        const result = await service.findAll();

        expect(result).toEqual([{
            id: 2,
            name: 'Pro',
            description: 'Growth tier',
            monthlyPrice: 499,
            billingType: PlanBillingType.RECURRING,
            currency: 'USD',
            maxHotels: 10,
            maxUsers: 50,
            apiAccess: true,
            supportTier: 'Priority',
            features: ['API access'],
            isActive: true,
            stripeProductId: null,
            stripePriceId: null,
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
        }]);
    });

    it('exposes only active marketing fields for public plan listing', async () => {
        mockPlanRepo.find.mockResolvedValue([{
            ...mockPlan,
            stripeProductId: 'prod_hidden',
            stripePriceId: 'price_hidden',
        }]);

        const result = await service.findActivePublicPlans();

        expect(mockPlanRepo.find).toHaveBeenCalledWith({
            where: { isActive: true },
            order: { monthlyPrice: 'ASC', id: 'ASC' },
        });
        expect(result).toEqual([{
            id: 2,
            name: 'Pro',
            description: 'Growth tier',
            monthlyPrice: 499,
            billingType: PlanBillingType.RECURRING,
            currency: 'USD',
            maxHotels: 10,
            maxUsers: 50,
            apiAccess: true,
            supportTier: 'Priority',
            features: ['API access'],
            canSubscribe: true,
        }]);
    });

    it('rejects duplicate plan names on create', async () => {
        mockPlanRepo.findOne.mockResolvedValue(mockPlan);

        await expect(service.create({
            name: 'Pro',
            description: 'Duplicate',
            monthlyPrice: 499,
            billingType: PlanBillingType.RECURRING,
            currency: 'USD',
            maxHotels: 10,
            maxUsers: 50,
            apiAccess: true,
            supportTier: 'Priority',
            features: [],
        })).rejects.toThrow(ConflictException);
    });

    it('soft-disables plans that have active subscriptions instead of deleting them', async () => {
        mockPlanRepo.findOne.mockResolvedValue({ ...mockPlan });
        mockSubscriptionRepo.count.mockResolvedValue(1);
        mockPlanRepo.save.mockImplementation(async (plan) => plan);

        const result = await service.remove(2);

        expect(mockSubscriptionRepo.count).toHaveBeenCalledWith({
            where: [
                { planId: 2, status: SubscriptionStatus.ACTIVE },
                { planId: 2, status: SubscriptionStatus.PAST_DUE },
            ],
        });
        expect(mockPlanRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
        expect(mockPlanRepo.delete).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true, deactivated: true });
    });

    it('throws when deleting a missing plan', async () => {
        mockPlanRepo.findOne.mockResolvedValue(null);

        await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
});
