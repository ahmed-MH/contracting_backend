import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlanBillingType, PublicSignupStatus } from '../../common/constants/enums';
import { MailService } from '../mail/mail.service';
import { Plan } from '../plans/entities/plan.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { BillingService } from './billing.service';
import { PublicSignup } from './entities/public-signup.entity';

describe('BillingService', () => {
    let service: BillingService;
    const configService = { get: jest.fn() };
    const mailService = { sendUserInvitation: jest.fn() };
    const tenantRepo = { findOne: jest.fn(), save: jest.fn() };
    const planRepo = { findOne: jest.fn() };
    const subscriptionRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const publicSignupRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const userRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BillingService,
                { provide: ConfigService, useValue: configService },
                { provide: MailService, useValue: mailService },
                { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
                { provide: getRepositoryToken(Plan), useValue: planRepo },
                { provide: getRepositoryToken(Subscription), useValue: subscriptionRepo },
                { provide: getRepositoryToken(PublicSignup), useValue: publicSignupRepo },
                { provide: getRepositoryToken(User), useValue: userRepo },
            ],
        }).compile();

        service = module.get(BillingService);
        jest.clearAllMocks();
    });

    it('fails clearly when Stripe is not configured', async () => {
        configService.get.mockReturnValue(undefined);

        await expect(service.createCheckoutSession({ tenantId: 1, planId: 2 }))
            .rejects.toThrow(ServiceUnavailableException);
    });

    it('rejects checkout when the selected plan has no Stripe price ID', async () => {
        configService.get.mockImplementation((key: string) => {
            if (key === 'STRIPE_SECRET_KEY') return 'sk_test_123';
            if (key === 'FRONTEND_URL') return 'http://localhost:5173';
            return undefined;
        });
        tenantRepo.findOne.mockResolvedValue({ id: 1, name: 'Demo Tenant', stripeCustomerId: null });
        planRepo.findOne.mockResolvedValue({
            id: 2,
            name: 'Pro',
            isActive: true,
            stripePriceId: null,
        });

        await expect(service.createCheckoutSession({ tenantId: 1, planId: 2 }))
            .rejects.toThrow(BadRequestException);
    });

    it('uses Stripe payment mode for one-time plans', async () => {
        configService.get.mockImplementation((key: string) => {
            if (key === 'FRONTEND_URL') return 'http://localhost:5173';
            return undefined;
        });
        const stripeCreateSession = jest.fn().mockResolvedValue({ id: 'cs_test_123', url: 'https://checkout.stripe.test/session' });
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            checkout: { sessions: { create: stripeCreateSession } },
        };

        tenantRepo.findOne.mockResolvedValue({ id: 1, name: 'Demo Tenant', stripeCustomerId: 'cus_test_123' });
        planRepo.findOne.mockResolvedValue({
            id: 2,
            name: 'Launch',
            isActive: true,
            billingType: PlanBillingType.ONE_TIME,
            stripePriceId: 'price_one_time',
            monthlyPrice: 499,
            currency: 'USD',
        });
        subscriptionRepo.findOne.mockResolvedValue(null);
        subscriptionRepo.create.mockImplementation((value) => value);
        subscriptionRepo.save.mockImplementation(async (value) => ({ ...value, id: value.id ?? 10 }));

        await service.createCheckoutSession({ tenantId: 1, planId: 2 });

        expect(stripeCreateSession).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'payment',
            line_items: [{ price: 'price_one_time', quantity: 1 }],
            payment_intent_data: expect.objectContaining({
                metadata: expect.objectContaining({ tenantId: '1', planId: '2', localSubscriptionId: '10' }),
            }),
        }));
    });

    it('expires an unpaid public signup retry and creates a fresh checkout session', async () => {
        configService.get.mockImplementation((key: string) => {
            if (key === 'FRONTEND_URL') return 'http://localhost:5173';
            return undefined;
        });
        const stripeCreateSession = jest.fn().mockResolvedValue({ id: 'cs_retry_123', url: 'https://checkout.stripe.test/retry' });
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            checkout: { sessions: { create: stripeCreateSession } },
            customers: { create: jest.fn() },
        };
        const plan = {
            id: 2,
            name: 'Plus',
            isActive: true,
            billingType: PlanBillingType.ONE_TIME,
            stripePriceId: 'price_plus_once',
            monthlyPrice: 199,
            currency: 'USD',
        };
        const pendingSignup = {
            id: 7,
            companyName: 'Demo Co',
            adminEmail: 'admin@example.com',
            stripeCustomerId: 'cus_existing',
            status: PublicSignupStatus.PENDING_PAYMENT,
        };

        planRepo.findOne.mockResolvedValue(plan);
        userRepo.findOne.mockResolvedValue(null);
        publicSignupRepo.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(pendingSignup);
        publicSignupRepo.create.mockImplementation((value) => value);
        publicSignupRepo.save.mockImplementation(async (value) => ({ ...value, id: value.id ?? 8 }));

        const result = await service.createPublicOnboardingCheckoutSession({
            planId: 2,
            companyName: 'Demo Co',
            adminFullName: 'Demo Admin',
            adminEmail: 'admin@example.com',
        });

        expect(pendingSignup.status).toBe(PublicSignupStatus.EXPIRED);
        expect(publicSignupRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            id: 7,
            status: PublicSignupStatus.EXPIRED,
        }));
        expect(publicSignupRepo.create).toHaveBeenCalledWith(expect.objectContaining({
            companyName: 'Demo Co',
            adminEmail: 'admin@example.com',
            stripeCustomerId: 'cus_existing',
            status: PublicSignupStatus.PENDING_PAYMENT,
        }));
        expect(stripeCreateSession).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'payment',
            customer: 'cus_existing',
            metadata: expect.objectContaining({ onboardingId: '8', planId: '2' }),
        }));
        expect(result.checkoutUrl).toBe('https://checkout.stripe.test/retry');
    });
});
