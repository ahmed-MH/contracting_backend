import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { PlanBillingType, PublicSignupStatus, SubscriptionStatus, UserRole } from '../../common/constants/enums';
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
    const dataSource = { transaction: jest.fn() };
    const tenantRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const planRepo = { findOne: jest.fn() };
    const subscriptionRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const publicSignupRepo = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), update: jest.fn() };
    const userRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const auditService = {
        log: jest.fn(),
        logBilling: jest.fn(),
        logWebhook: jest.fn(),
        resolveActor: jest.fn().mockResolvedValue({ userId: null, email: null, role: 'SYSTEM', name: 'System' }),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BillingService,
                { provide: ConfigService, useValue: configService },
                { provide: MailService, useValue: mailService },
                { provide: DataSource, useValue: dataSource },
                { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
                { provide: getRepositoryToken(Plan), useValue: planRepo },
                { provide: getRepositoryToken(Subscription), useValue: subscriptionRepo },
                { provide: getRepositoryToken(PublicSignup), useValue: publicSignupRepo },
                { provide: getRepositoryToken(User), useValue: userRepo },
                { provide: AuditService, useValue: auditService },
            ],
        }).compile();

        service = module.get(BillingService);
        jest.resetAllMocks();
        dataSource.transaction.mockImplementation(async (callback) => callback({
            getRepository: (entity: unknown) => {
                if (entity === Tenant) return tenantRepo;
                if (entity === Plan) return planRepo;
                if (entity === Subscription) return subscriptionRepo;
                if (entity === PublicSignup) return publicSignupRepo;
                if (entity === User) return userRepo;
                throw new Error('Unexpected repository token');
            },
        }));
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

    it('rejects supervisor checkout when the tenant already has active billing for the same plan', async () => {
        configService.get.mockImplementation((key: string) => {
            if (key === 'STRIPE_SECRET_KEY') return 'sk_test_123';
            return undefined;
        });
        tenantRepo.findOne.mockResolvedValue({ id: 1, name: 'Demo Tenant', stripeCustomerId: 'cus_test_123' });
        planRepo.findOne.mockResolvedValue({
            id: 2,
            name: 'Plus',
            isActive: true,
            stripePriceId: 'price_plus',
        });
        subscriptionRepo.findOne.mockResolvedValue({
            id: 10,
            tenantId: 1,
            planId: 2,
            status: SubscriptionStatus.ACTIVE,
        });

        await expect(service.createCheckoutSession({ tenantId: 1, planId: 2 }))
            .rejects.toThrow(ConflictException);
    });

    it('allows supervisor manual checkout recovery for a past-due subscription', async () => {
        configService.get.mockImplementation((key: string) => {
            if (key === 'FRONTEND_URL') return 'http://localhost:5173';
            return undefined;
        });
        const stripeCreateSession = jest.fn().mockResolvedValue({ id: 'cs_recovery_123', url: 'https://checkout.stripe.test/recovery' });
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            checkout: { sessions: { create: stripeCreateSession } },
        };
        const tenant = { id: 1, name: 'Demo Tenant', stripeCustomerId: 'cus_test_123' };
        const plan = {
            id: 2,
            name: 'Plus',
            isActive: true,
            billingType: PlanBillingType.RECURRING,
            stripePriceId: 'price_plus',
            monthlyPrice: 199,
            currency: 'USD',
        };
        const pastDueSubscription = {
            id: 10,
            tenantId: 1,
            tenant,
            planId: 2,
            plan,
            status: SubscriptionStatus.PAST_DUE,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            monthlyPrice: 199,
            currency: 'USD',
            note: null,
        };

        tenantRepo.findOne.mockResolvedValue(tenant);
        planRepo.findOne.mockResolvedValue(plan);
        subscriptionRepo.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(pastDueSubscription);
        subscriptionRepo.save.mockImplementation(async (value) => ({ ...value, id: value.id ?? 10 }));

        const result = await service.createCheckoutSession({ tenantId: 1, planId: 2 });

        expect(stripeCreateSession).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'subscription',
            line_items: [{ price: 'price_plus', quantity: 1 }],
        }));
        expect(subscriptionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            id: 10,
            status: SubscriptionStatus.PAST_DUE,
            stripeCheckoutSessionId: 'cs_recovery_123',
        }));
        expect(auditService.logBilling).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'SUPERVISOR_MANUAL_CHECKOUT_SESSION_CREATED',
            tenantId: 1,
        }));
        expect(result.checkoutUrl).toBe('https://checkout.stripe.test/recovery');
    });

    it('expires an older supervisor manual checkout before creating a replacement session', async () => {
        configService.get.mockImplementation((key: string) => {
            if (key === 'FRONTEND_URL') return 'http://localhost:5173';
            return undefined;
        });
        const stripeCreateSession = jest.fn().mockResolvedValue({ id: 'cs_manual_new', url: 'https://checkout.stripe.test/manual-new' });
        const stripeRetrieveSession = jest.fn().mockResolvedValue({ id: 'cs_manual_old', status: 'open', payment_status: 'unpaid' });
        const stripeExpireSession = jest.fn().mockResolvedValue({ id: 'cs_manual_old', status: 'expired' });
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            checkout: { sessions: { create: stripeCreateSession, retrieve: stripeRetrieveSession, expire: stripeExpireSession } },
        };
        const tenant = { id: 1, name: 'Demo Tenant', stripeCustomerId: 'cus_test_123' };
        const plan = {
            id: 3,
            name: 'Enterprise',
            isActive: true,
            billingType: PlanBillingType.RECURRING,
            stripePriceId: 'price_enterprise',
            monthlyPrice: 299,
            currency: 'USD',
        };
        const existingSubscription = {
            id: 10,
            tenantId: 1,
            tenant,
            planId: 2,
            status: SubscriptionStatus.PAST_DUE,
            stripeCheckoutSessionId: 'cs_manual_old',
            currentPeriodStart: null,
            currentPeriodEnd: null,
        };

        tenantRepo.findOne.mockResolvedValue(tenant);
        planRepo.findOne.mockResolvedValue(plan);
        subscriptionRepo.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(existingSubscription);
        subscriptionRepo.save.mockImplementation(async (value) => ({ ...value, id: value.id ?? 10 }));

        const result = await service.createCheckoutSession({ tenantId: 1, planId: 3 });

        expect(stripeRetrieveSession).toHaveBeenCalledWith('cs_manual_old');
        expect(stripeExpireSession).toHaveBeenCalledWith('cs_manual_old');
        expect(subscriptionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            id: 10,
            planId: 3,
            status: SubscriptionStatus.PAST_DUE,
            stripeCheckoutSessionId: 'cs_manual_new',
        }));
        expect(result.sessionId).toBe('cs_manual_new');
    });

    it('lists public signups with supervisor-safe operational fields', async () => {
        const createdAt = new Date('2026-05-01T10:00:00.000Z');
        const updatedAt = new Date('2026-05-01T10:05:00.000Z');
        publicSignupRepo.find.mockResolvedValue([{
            id: 12,
            companyName: 'Demo Hotels',
            adminFullName: 'Demo Admin',
            adminEmail: 'admin@demo.test',
            phone: '+21600000000',
            planId: 3,
            plan: { id: 3, name: 'Launch', billingType: PlanBillingType.ONE_TIME },
            status: PublicSignupStatus.FAILED,
            failureReason: 'Stripe checkout async payment failed.',
            stripeCheckoutSessionId: 'cs_test_123',
            stripeCustomerId: 'cus_secretish',
            tenantId: null,
            adminUserId: null,
            subscriptionId: null,
            completedAt: null,
            createdAt,
            updatedAt,
        }]);

        const result = await service.listPublicSignups({ status: PublicSignupStatus.FAILED, limit: 25, page: 2 });

        expect(publicSignupRepo.find).toHaveBeenCalledWith(expect.objectContaining({
            where: { status: PublicSignupStatus.FAILED },
            relations: ['plan'],
            order: { createdAt: 'DESC' },
            take: 25,
            skip: 25,
        }));
        expect(result).toEqual([expect.objectContaining({
            id: 12,
            companyName: 'Demo Hotels',
            adminEmail: 'admin@demo.test',
            planName: 'Launch',
            billingType: PlanBillingType.ONE_TIME,
            status: PublicSignupStatus.FAILED,
            failureReason: 'Stripe checkout async payment failed.',
            stripeCheckoutSessionId: 'cs_test_123',
            createdAt,
            updatedAt,
        })]);
        expect(result[0]).not.toHaveProperty('stripeCustomerId');
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

    it('creates a tenant admin upgrade checkout with a pending subscription for the current tenant', async () => {
        configService.get.mockImplementation((key: string) => {
            if (key === 'FRONTEND_URL') return 'http://localhost:5173';
            return undefined;
        });
        const stripeCreateSession = jest.fn().mockResolvedValue({ id: 'cs_admin_upgrade', url: 'https://checkout.stripe.test/admin-upgrade' });
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            checkout: { sessions: { create: stripeCreateSession } },
        };
        const tenant = { id: 5, name: 'Legacy Tenant', stripeCustomerId: 'cus_legacy' };
        const plan = {
            id: 8,
            name: 'API Pro',
            isActive: true,
            billingType: PlanBillingType.RECURRING,
            stripePriceId: 'price_api_pro',
            monthlyPrice: 99,
            currency: 'USD',
        };
        const pendingSubscription = {
            id: 44,
            tenantId: tenant.id,
            tenant,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            note: null,
        };

        userRepo.findOne.mockResolvedValue({
            id: 10,
            email: 'admin@example.com',
            role: UserRole.ADMIN,
            tenantId: tenant.id,
            tenant,
        });
        tenantRepo.findOne.mockResolvedValue(tenant);
        planRepo.findOne.mockResolvedValue(plan);
        subscriptionRepo.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(pendingSubscription);
        subscriptionRepo.save.mockImplementation(async (value) => ({ ...value, id: value.id ?? 44 }));

        const result = await service.createTenantAdminCheckoutSession({
            id: 10,
            email: 'admin@example.com',
            role: UserRole.ADMIN,
            hotelIds: [],
            tenantId: tenant.id,
        }, { planId: plan.id });

        expect(subscriptionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            id: 44,
            tenantId: tenant.id,
            planId: plan.id,
            status: SubscriptionStatus.PAST_DUE,
            stripeCheckoutSessionId: 'cs_admin_upgrade',
        }));
        expect(stripeCreateSession).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'subscription',
            customer: 'cus_legacy',
            success_url: 'http://localhost:5173/profile/billing/success?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'http://localhost:5173/profile/billing/cancel',
            metadata: expect.objectContaining({
                tenantId: '5',
                planId: '8',
                subscriptionId: '44',
                source: 'tenant_admin_upgrade',
            }),
        }));
        expect(auditService.logBilling).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'TENANT_ADMIN_CHECKOUT_SESSION_CREATED',
            tenantId: tenant.id,
        }));
        expect(result.checkoutUrl).toBe('https://checkout.stripe.test/admin-upgrade');
    });

    it('expires an older tenant admin checkout before creating a replacement session', async () => {
        configService.get.mockImplementation((key: string) => {
            if (key === 'FRONTEND_URL') return 'http://localhost:5173';
            return undefined;
        });
        const stripeCreateSession = jest.fn().mockResolvedValue({ id: 'cs_admin_new', url: 'https://checkout.stripe.test/admin-new' });
        const stripeRetrieveSession = jest.fn().mockResolvedValue({ id: 'cs_admin_old', status: 'open', payment_status: 'unpaid' });
        const stripeExpireSession = jest.fn().mockResolvedValue({ id: 'cs_admin_old', status: 'expired' });
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            checkout: { sessions: { create: stripeCreateSession, retrieve: stripeRetrieveSession, expire: stripeExpireSession } },
        };
        const tenant = { id: 5, name: 'Legacy Tenant', stripeCustomerId: 'cus_legacy' };
        const plan = {
            id: 8,
            name: 'API Pro',
            isActive: true,
            billingType: PlanBillingType.RECURRING,
            stripePriceId: 'price_api_pro',
            monthlyPrice: 99,
            currency: 'USD',
        };
        const pendingSubscription = {
            id: 44,
            tenantId: tenant.id,
            tenant,
            planId: 7,
            status: SubscriptionStatus.PAST_DUE,
            stripeCheckoutSessionId: 'cs_admin_old',
            currentPeriodStart: null,
            currentPeriodEnd: null,
        };

        userRepo.findOne.mockResolvedValue({
            id: 10,
            email: 'admin@example.com',
            role: UserRole.ADMIN,
            tenantId: tenant.id,
            tenant,
        });
        tenantRepo.findOne.mockResolvedValue(tenant);
        planRepo.findOne.mockResolvedValue(plan);
        subscriptionRepo.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(pendingSubscription);
        subscriptionRepo.save.mockImplementation(async (value) => ({ ...value, id: value.id ?? 44 }));

        const result = await service.createTenantAdminCheckoutSession({
            id: 10,
            email: 'admin@example.com',
            role: UserRole.ADMIN,
            hotelIds: [],
            tenantId: tenant.id,
        }, { planId: plan.id });

        expect(stripeRetrieveSession).toHaveBeenCalledWith('cs_admin_old');
        expect(stripeExpireSession).toHaveBeenCalledWith('cs_admin_old');
        expect(subscriptionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            id: 44,
            planId: 8,
            status: SubscriptionStatus.PAST_DUE,
            stripeCheckoutSessionId: 'cs_admin_new',
        }));
        expect(result.sessionId).toBe('cs_admin_new');
    });

    it('rejects tenant admin checkout for commercial and agent users', async () => {
        await expect(service.createTenantAdminCheckoutSession({
            id: 10,
            email: 'commercial@example.com',
            role: UserRole.COMMERCIAL,
            hotelIds: [],
            tenantId: 5,
        }, { planId: 8 })).rejects.toThrow('Only tenant administrators can manage billing');

        await expect(service.createTenantAdminCheckoutSession({
            id: 11,
            email: 'agent@example.com',
            role: UserRole.AGENT,
            hotelIds: [],
            tenantId: 5,
        }, { planId: 8 })).rejects.toThrow('Only tenant administrators can manage billing');
    });

    it('rejects tenant admin checkout before organization setup', async () => {
        userRepo.findOne.mockResolvedValue({
            id: 10,
            email: 'admin@example.com',
            role: UserRole.ADMIN,
            tenantId: null,
            tenant: null,
        });

        await expect(service.createTenantAdminCheckoutSession({
            id: 10,
            email: 'admin@example.com',
            role: UserRole.ADMIN,
            hotelIds: [],
            tenantId: null,
        }, { planId: 8 })).rejects.toThrow('Organization setup is required before choosing a plan.');

        expect(tenantRepo.findOne).not.toHaveBeenCalled();
        expect(planRepo.findOne).not.toHaveBeenCalled();
        expect(subscriptionRepo.save).not.toHaveBeenCalled();
    });

    it('rejects tenant admin checkout when the same plan is already active', async () => {
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            checkout: { sessions: { create: jest.fn() } },
        };
        const tenant = { id: 5, name: 'Legacy Tenant', stripeCustomerId: 'cus_legacy' };
        userRepo.findOne.mockResolvedValue({
            id: 10,
            email: 'admin@example.com',
            role: UserRole.ADMIN,
            tenantId: tenant.id,
            tenant,
        });
        tenantRepo.findOne.mockResolvedValue(tenant);
        planRepo.findOne.mockResolvedValue({
            id: 8,
            name: 'API Pro',
            isActive: true,
            stripePriceId: 'price_api_pro',
        });
        subscriptionRepo.findOne.mockResolvedValue({
            id: 44,
            tenantId: 5,
            planId: 8,
            status: SubscriptionStatus.ACTIVE,
        });

        await expect(service.createTenantAdminCheckoutSession({
            id: 10,
            email: 'admin@example.com',
            role: UserRole.ADMIN,
            hotelIds: [],
            tenantId: 5,
        }, { planId: 8 })).rejects.toThrow(ConflictException);
    });

    it('activates an existing tenant subscription from a tenant admin upgrade webhook without provisioning users', async () => {
        configService.get.mockImplementation((key: string) => key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test' : undefined);
        const tenant = { id: 5, name: 'Legacy Tenant', stripeCustomerId: null };
        const plan = {
            id: 8,
            name: 'API Pro',
            billingType: PlanBillingType.RECURRING,
            monthlyPrice: 99,
            currency: 'USD',
        };
        const subscription = {
            id: 44,
            tenantId: 5,
            tenant,
            planId: 8,
            plan,
            status: SubscriptionStatus.PAST_DUE,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            monthlyPrice: 99,
            currency: 'USD',
            note: null,
        };
        const session = {
            id: 'cs_admin_upgrade',
            mode: 'subscription',
            status: 'complete',
            payment_status: 'paid',
            customer: 'cus_legacy',
            subscription: 'sub_api_pro',
            metadata: {
                source: 'tenant_admin_upgrade',
                tenantId: '5',
                planId: '8',
                subscriptionId: '44',
            },
        };
        const stripeSubscription = {
            id: 'sub_api_pro',
            status: 'active',
            customer: 'cus_legacy',
            metadata: { tenantId: '5', planId: '8', subscriptionId: '44' },
            current_period_start: 1778774400,
            current_period_end: 1781366400,
        };
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            webhooks: {
                constructEvent: jest.fn().mockReturnValue({
                    id: 'evt_admin_upgrade',
                    type: 'checkout.session.completed',
                    data: { object: session },
                }),
            },
            subscriptions: { retrieve: jest.fn().mockResolvedValue(stripeSubscription) },
        };
        tenantRepo.findOne.mockResolvedValue(tenant);
        planRepo.findOne.mockResolvedValue(plan);
        subscriptionRepo.findOne.mockResolvedValue(subscription);
        subscriptionRepo.save.mockImplementation(async (value) => value);
        tenantRepo.save.mockImplementation(async (value) => value);

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(subscriptionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            id: 44,
            tenantId: 5,
            planId: 8,
            status: SubscriptionStatus.ACTIVE,
            stripeCheckoutSessionId: 'cs_admin_upgrade',
            stripeSubscriptionId: 'sub_api_pro',
            currentPeriodStart: '2026-05-14',
            currentPeriodEnd: '2026-06-13',
        }));
        expect(tenantRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            id: 5,
            stripeCustomerId: 'cus_legacy',
        }));
        expect(auditService.logWebhook).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'STRIPE_WEBHOOK_RECEIVED',
            targetId: 'evt_admin_upgrade',
        }));
        expect(auditService.logWebhook).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'CHECKOUT_SESSION_COMPLETED',
            tenantId: 5,
        }));
        expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('ignores an older tenant admin checkout webhook after a newer checkout session superseded it', async () => {
        configService.get.mockImplementation((key: string) => key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test' : undefined);
        const tenant = { id: 5, name: 'Legacy Tenant', stripeCustomerId: 'cus_legacy' };
        const oldPlan = {
            id: 8,
            name: 'API Pro',
            billingType: PlanBillingType.RECURRING,
            monthlyPrice: 99,
            currency: 'USD',
        };
        const currentSubscription = {
            id: 44,
            tenantId: 5,
            tenant,
            planId: 9,
            status: SubscriptionStatus.PAST_DUE,
            stripeCheckoutSessionId: 'cs_admin_newer',
            currentPeriodStart: null,
            currentPeriodEnd: null,
            monthlyPrice: 149,
            currency: 'USD',
            note: null,
        };
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            webhooks: {
                constructEvent: jest.fn().mockReturnValue({
                    id: 'evt_admin_old',
                    type: 'checkout.session.completed',
                    data: {
                        object: {
                            id: 'cs_admin_older',
                            mode: 'subscription',
                            status: 'complete',
                            payment_status: 'paid',
                            customer: 'cus_legacy',
                            subscription: 'sub_old_plan',
                            metadata: {
                                source: 'tenant_admin_upgrade',
                                tenantId: '5',
                                planId: '8',
                                subscriptionId: '44',
                            },
                        },
                    },
                }),
            },
            subscriptions: { retrieve: jest.fn() },
        };
        tenantRepo.findOne.mockResolvedValue(tenant);
        planRepo.findOne.mockResolvedValue(oldPlan);
        subscriptionRepo.findOne.mockResolvedValue(currentSubscription);

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(subscriptionRepo.save).not.toHaveBeenCalled();
        expect((service as any).stripeClient.subscriptions.retrieve).not.toHaveBeenCalled();
        expect(auditService.logWebhook).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'STRIPE_WEBHOOK_STALE_CHECKOUT_IGNORED',
            tenantId: 5,
        }));
    });

    it('keeps recurring tenant admin checkout past due if Stripe subscription retrieval fails', async () => {
        configService.get.mockImplementation((key: string) => key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test' : undefined);
        const tenant = { id: 5, name: 'Legacy Tenant', stripeCustomerId: 'cus_legacy' };
        const plan = {
            id: 8,
            name: 'API Pro',
            billingType: PlanBillingType.RECURRING,
            monthlyPrice: 99,
            currency: 'USD',
        };
        const subscription = {
            id: 44,
            tenantId: 5,
            tenant,
            planId: 8,
            plan,
            status: SubscriptionStatus.PAST_DUE,
            stripeCheckoutSessionId: 'cs_admin_upgrade',
            currentPeriodStart: null,
            currentPeriodEnd: null,
            monthlyPrice: 99,
            currency: 'USD',
            note: null,
        };
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            webhooks: {
                constructEvent: jest.fn().mockReturnValue({
                    id: 'evt_admin_retrieval_failed',
                    type: 'checkout.session.completed',
                    data: {
                        object: {
                            id: 'cs_admin_upgrade',
                            mode: 'subscription',
                            status: 'complete',
                            payment_status: 'paid',
                            customer: 'cus_legacy',
                            subscription: 'sub_api_pro',
                            metadata: {
                                source: 'tenant_admin_upgrade',
                                tenantId: '5',
                                planId: '8',
                                subscriptionId: '44',
                            },
                        },
                    },
                }),
            },
            subscriptions: { retrieve: jest.fn().mockRejectedValue(new Error('Stripe unavailable')) },
        };
        tenantRepo.findOne.mockResolvedValue(tenant);
        planRepo.findOne.mockResolvedValue(plan);
        subscriptionRepo.findOne.mockResolvedValue(subscription);
        subscriptionRepo.save.mockImplementation(async (value) => value);

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(subscriptionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            id: 44,
            status: SubscriptionStatus.PAST_DUE,
            stripeCheckoutSessionId: 'cs_admin_upgrade',
            stripeSubscriptionId: 'sub_api_pro',
            note: expect.stringContaining('Stripe subscription retrieval failed'),
        }));
    });

    it('activates one-time tenant admin upgrades without storing a Stripe subscription ID', async () => {
        configService.get.mockImplementation((key: string) => key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test' : undefined);
        const tenant = { id: 5, name: 'Legacy Tenant', stripeCustomerId: 'cus_legacy' };
        const plan = {
            id: 9,
            name: 'Launch',
            billingType: PlanBillingType.ONE_TIME,
            monthlyPrice: 499,
            currency: 'USD',
        };
        const subscription = {
            id: 45,
            tenantId: 5,
            tenant,
            planId: 9,
            plan,
            status: SubscriptionStatus.PAST_DUE,
            currentPeriodStart: null,
            monthlyPrice: 499,
            currency: 'USD',
            stripeSubscriptionId: 'sub_old',
        };
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            webhooks: {
                constructEvent: jest.fn().mockReturnValue({
                    id: 'evt_admin_one_time',
                    type: 'checkout.session.completed',
                    data: {
                        object: {
                            id: 'cs_admin_one_time',
                            mode: 'payment',
                            status: 'complete',
                            payment_status: 'paid',
                            customer: 'cus_legacy',
                            metadata: {
                                source: 'tenant_admin_upgrade',
                                tenantId: '5',
                                planId: '9',
                                subscriptionId: '45',
                            },
                        },
                    },
                }),
            },
        };
        tenantRepo.findOne.mockResolvedValue(tenant);
        planRepo.findOne.mockResolvedValue(plan);
        subscriptionRepo.findOne.mockResolvedValue(subscription);
        subscriptionRepo.save.mockImplementation(async (value) => value);

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(subscriptionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            id: 45,
            status: SubscriptionStatus.ACTIVE,
            stripeCheckoutSessionId: 'cs_admin_one_time',
            stripeSubscriptionId: null,
        }));
        expect(tenantRepo.save).not.toHaveBeenCalled();
        expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('expires an unpaid public signup retry and creates a fresh checkout session', async () => {
        configService.get.mockImplementation((key: string) => {
            if (key === 'FRONTEND_URL') return 'http://localhost:5173';
            return undefined;
        });
        const stripeCreateSession = jest.fn().mockResolvedValue({ id: 'cs_retry_123', url: 'https://checkout.stripe.test/retry' });
        const stripeRetrieveSession = jest.fn().mockResolvedValue({ id: 'cs_old_123', status: 'open', payment_status: 'unpaid', customer: 'cus_existing' });
        const stripeExpireSession = jest.fn().mockResolvedValue({ id: 'cs_old_123', status: 'expired' });
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            checkout: { sessions: { create: stripeCreateSession, retrieve: stripeRetrieveSession, expire: stripeExpireSession } },
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
            plan,
            stripeCustomerId: 'cus_existing',
            stripeCheckoutSessionId: 'cs_old_123',
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
        expect(stripeRetrieveSession).toHaveBeenCalledWith('cs_old_123');
        expect(stripeExpireSession).toHaveBeenCalledWith('cs_old_123');
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
        expect(auditService.logBilling).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'PUBLIC_ONBOARDING_CHECKOUT_SESSION_CREATED',
            actorEmail: 'admin@example.com',
        }));
        expect(result.checkoutUrl).toBe('https://checkout.stripe.test/retry');
    });

    it('completes an expired public signup if Stripe reports the old checkout was paid', async () => {
        configService.get.mockImplementation((key: string) => key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test' : undefined);
        const plan = {
            id: 2,
            name: 'Plus',
            billingType: PlanBillingType.ONE_TIME,
            monthlyPrice: 199,
            currency: 'USD',
        };
        const signup = {
            id: 7,
            companyName: 'Demo Co',
            adminFullName: 'Demo Admin',
            adminEmail: 'admin@example.com',
            planId: 2,
            plan,
            stripeCustomerId: 'cus_existing',
            stripeCheckoutSessionId: 'cs_paid_old',
            status: PublicSignupStatus.EXPIRED,
            tenantId: null,
            adminUserId: null,
            subscriptionId: null,
            completedAt: null,
            lastStripeEventId: null,
            failureReason: null,
        };
        const session = {
            id: 'cs_paid_old',
            mode: 'payment',
            payment_status: 'paid',
            status: 'complete',
            customer: 'cus_existing',
            metadata: { onboardingId: '7', planId: '2' },
        };
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            webhooks: {
                constructEvent: jest.fn().mockReturnValue({
                    id: 'evt_paid_old',
                    type: 'checkout.session.completed',
                    data: { object: session },
                }),
            },
        };

        publicSignupRepo.findOne.mockResolvedValue(signup);
        publicSignupRepo.save.mockImplementation(async (value) => value);
        tenantRepo.findOne.mockResolvedValue(null);
        tenantRepo.create.mockImplementation((value) => value);
        tenantRepo.save.mockImplementation(async (value) => ({ ...value, id: 101 }));
        userRepo.findOne.mockResolvedValue(null);
        userRepo.create.mockImplementation((value) => value);
        userRepo.save.mockImplementation(async (value) => ({ ...value, id: 202 }));
        subscriptionRepo.findOne.mockResolvedValue(null);
        subscriptionRepo.create.mockImplementation((value) => value);
        subscriptionRepo.save.mockImplementation(async (value) => ({ ...value, id: 303 }));

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(signup.status).toBe(PublicSignupStatus.COMPLETED);
        expect(signup.tenantId).toBe(101);
        expect(signup.adminUserId).toBe(202);
        expect(signup.subscriptionId).toBe(303);
        expect(signup.lastStripeEventId).toBe('evt_paid_old');
        expect(mailService.sendUserInvitation).toHaveBeenCalledWith('admin@example.com', expect.any(String));
        expect(subscriptionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 101,
            planId: 2,
            status: SubscriptionStatus.ACTIVE,
            stripeCheckoutSessionId: 'cs_paid_old',
        }));
    });

    it('keeps recurring public onboarding past due when Stripe subscription retrieval fails', async () => {
        configService.get.mockImplementation((key: string) => key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test' : undefined);
        const plan = {
            id: 2,
            name: 'Plus',
            billingType: PlanBillingType.RECURRING,
            monthlyPrice: 199,
            currency: 'USD',
        };
        const signup = {
            id: 7,
            companyName: 'Demo Co',
            adminFullName: 'Demo Admin',
            adminEmail: 'admin@example.com',
            planId: 2,
            plan,
            stripeCustomerId: 'cus_existing',
            stripeCheckoutSessionId: 'cs_paid_recurring',
            status: PublicSignupStatus.PENDING_PAYMENT,
            tenantId: null,
            adminUserId: null,
            subscriptionId: null,
            completedAt: null,
            lastStripeEventId: null,
            failureReason: null,
        };
        const session = {
            id: 'cs_paid_recurring',
            mode: 'subscription',
            payment_status: 'paid',
            status: 'complete',
            customer: 'cus_existing',
            subscription: 'sub_retrieve_fails',
            metadata: { onboardingId: '7', planId: '2' },
        };
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            webhooks: {
                constructEvent: jest.fn().mockReturnValue({
                    id: 'evt_paid_recurring',
                    type: 'checkout.session.completed',
                    data: { object: session },
                }),
            },
            subscriptions: { retrieve: jest.fn().mockRejectedValue(new Error('Stripe unavailable')) },
        };

        publicSignupRepo.findOne.mockResolvedValue(signup);
        publicSignupRepo.save.mockImplementation(async (value) => value);
        tenantRepo.findOne.mockResolvedValue(null);
        tenantRepo.create.mockImplementation((value) => value);
        tenantRepo.save.mockImplementation(async (value) => ({ ...value, id: 101 }));
        userRepo.findOne.mockResolvedValue(null);
        userRepo.create.mockImplementation((value) => value);
        userRepo.save.mockImplementation(async (value) => ({ ...value, id: 202 }));
        subscriptionRepo.findOne.mockResolvedValue(null);
        subscriptionRepo.create.mockImplementation((value) => value);
        subscriptionRepo.save.mockImplementation(async (value) => ({ ...value, id: 303 }));

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(signup.status).toBe(PublicSignupStatus.COMPLETED);
        expect(subscriptionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 101,
            planId: 2,
            status: SubscriptionStatus.PAST_DUE,
            stripeCheckoutSessionId: 'cs_paid_recurring',
            stripeSubscriptionId: 'sub_retrieve_fails',
            note: expect.stringContaining('Stripe subscription retrieval failed'),
        }));
    });

    it('does not provision a one-time public signup until checkout payment is paid', async () => {
        configService.get.mockImplementation((key: string) => key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test' : undefined);
        const signup = {
            id: 7,
            plan: { id: 2, billingType: PlanBillingType.ONE_TIME },
            status: PublicSignupStatus.PENDING_PAYMENT,
        };
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            webhooks: {
                constructEvent: jest.fn().mockReturnValue({
                    id: 'evt_processing',
                    type: 'checkout.session.completed',
                    data: {
                        object: {
                            id: 'cs_processing',
                            mode: 'payment',
                            payment_status: 'unpaid',
                            status: 'complete',
                            metadata: { onboardingId: '7' },
                        },
                    },
                }),
            },
        };
        publicSignupRepo.findOne.mockResolvedValue(signup);

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(dataSource.transaction).not.toHaveBeenCalled();
        expect(tenantRepo.save).not.toHaveBeenCalled();
        expect(userRepo.save).not.toHaveBeenCalled();
        expect(subscriptionRepo.save).not.toHaveBeenCalled();
    });

    it('ignores duplicate completed public signup webhook without creating another tenant or user', async () => {
        configService.get.mockImplementation((key: string) => key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test' : undefined);
        const signup = {
            id: 7,
            plan: { id: 2, billingType: PlanBillingType.ONE_TIME },
            status: PublicSignupStatus.COMPLETED,
            tenantId: 101,
            adminUserId: 202,
            subscriptionId: 303,
        };
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            webhooks: {
                constructEvent: jest.fn().mockReturnValue({
                    id: 'evt_duplicate',
                    type: 'checkout.session.completed',
                    data: {
                        object: {
                            id: 'cs_paid',
                            mode: 'payment',
                            payment_status: 'paid',
                            status: 'complete',
                            metadata: { onboardingId: '7' },
                        },
                    },
                }),
            },
        };
        publicSignupRepo.findOne.mockResolvedValue(signup);

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(dataSource.transaction).not.toHaveBeenCalled();
        expect(tenantRepo.save).not.toHaveBeenCalled();
        expect(userRepo.save).not.toHaveBeenCalled();
        expect(subscriptionRepo.save).not.toHaveBeenCalled();
    });

    it('fails onboarding safely when the admin email belongs to another tenant', async () => {
        configService.get.mockImplementation((key: string) => key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test' : undefined);
        const plan = {
            id: 2,
            name: 'Plus',
            billingType: PlanBillingType.ONE_TIME,
            monthlyPrice: 199,
            currency: 'USD',
        };
        const signup = {
            id: 7,
            companyName: 'Demo Co',
            adminFullName: 'Demo Admin',
            adminEmail: 'admin@example.com',
            planId: 2,
            plan,
            status: PublicSignupStatus.PENDING_PAYMENT,
            tenantId: null,
            adminUserId: null,
            subscriptionId: null,
            failureReason: null,
        };
        (service as unknown as { stripeClient: unknown }).stripeClient = {
            webhooks: {
                constructEvent: jest.fn().mockReturnValue({
                    id: 'evt_conflict',
                    type: 'checkout.session.completed',
                    data: {
                        object: {
                            id: 'cs_paid',
                            mode: 'payment',
                            payment_status: 'paid',
                            status: 'complete',
                            customer: 'cus_test',
                            metadata: { onboardingId: '7' },
                        },
                    },
                }),
            },
        };

        publicSignupRepo.findOne.mockResolvedValue(signup);
        publicSignupRepo.save.mockImplementation(async (value) => value);
        tenantRepo.findOne.mockResolvedValue(null);
        tenantRepo.create.mockImplementation((value) => value);
        tenantRepo.save.mockImplementation(async (value) => ({ ...value, id: 101 }));
        userRepo.findOne.mockResolvedValue({
            id: 999,
            email: 'admin@example.com',
            role: UserRole.ADMIN,
            tenantId: 999,
        });

        await service.handleWebhook(Buffer.from('{}'), 'sig');

        expect(signup.status).toBe(PublicSignupStatus.FAILED);
        expect(signup.failureReason).toContain('already registered');
        expect(subscriptionRepo.save).not.toHaveBeenCalled();
        expect(mailService.sendUserInvitation).not.toHaveBeenCalled();
    });
});
