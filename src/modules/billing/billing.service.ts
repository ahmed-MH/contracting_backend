import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import { In, Repository } from 'typeorm';
import { PlanBillingType, PublicSignupStatus, SubscriptionStatus, UserRole } from '../../common/constants/enums';
import { MailService } from '../mail/mail.service';
import { Plan } from '../plans/entities/plan.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreatePublicOnboardingCheckoutSessionDto } from './dto/create-public-onboarding-checkout-session.dto';
import { PublicSignup } from './entities/public-signup.entity';
import { mapStripeSubscriptionStatus } from './utils/stripe-status.mapper';

export interface CheckoutSessionResponse {
    checkoutUrl: string;
    sessionId: string;
}

type StripeReference = string | { id?: string } | null | undefined;

interface StripeSessionPayload {
    id: string;
    url?: string | null;
    customer?: StripeReference;
    subscription?: StripeReference;
    metadata?: Record<string, string> | null;
}

interface StripeSubscriptionPayload {
    id: string;
    status: string;
    customer?: StripeReference;
    metadata?: Record<string, string> | null;
    current_period_start?: number;
    current_period_end?: number;
}

interface StripeInvoicePayload {
    id?: string | null;
    subscription?: StripeReference;
}

type CheckoutMetadata = Record<string, string>;

@Injectable()
export class BillingService {
    private readonly logger = new Logger(BillingService.name);
    private stripeClient: any | null = null;

    constructor(
        private readonly configService: ConfigService,
        private readonly mailService: MailService,
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
        @InjectRepository(Plan)
        private readonly planRepo: Repository<Plan>,
        @InjectRepository(Subscription)
        private readonly subscriptionRepo: Repository<Subscription>,
        @InjectRepository(PublicSignup)
        private readonly publicSignupRepo: Repository<PublicSignup>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
    ) { }

    async createCheckoutSession(dto: CreateCheckoutSessionDto): Promise<CheckoutSessionResponse> {
        const stripe = this.getStripeClient();
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
        if (!plan.stripePriceId) {
            throw new BadRequestException(`Plan "${plan.name}" does not have a Stripe price ID configured`);
        }

        const customerId = await this.getOrCreateCustomer(stripe, tenant);
        const localSubscription = await this.createOrUpdatePendingSubscription(tenant, plan);
        const successUrl = this.buildFrontendUrl(
            this.configService.get<string>('STRIPE_SUCCESS_PATH') ?? '/platform/billing/success',
            '?session_id={CHECKOUT_SESSION_ID}',
        );
        const cancelUrl = this.buildFrontendUrl(
            this.configService.get<string>('STRIPE_CANCEL_PATH') ?? '/platform/billing/cancel',
        );

        const metadata = {
            tenantId: String(tenant.id),
            planId: String(plan.id),
            localSubscriptionId: String(localSubscription.id),
        };

        const session = await stripe.checkout.sessions.create(this.buildCheckoutSessionParams(plan, {
            customer: customerId,
            successUrl,
            cancelUrl,
            metadata,
        }));

        localSubscription.stripeCheckoutSessionId = session.id;
        await this.subscriptionRepo.save(localSubscription);

        if (!session.url) {
            throw new ServiceUnavailableException('Stripe did not return a checkout URL');
        }

        return {
            checkoutUrl: session.url,
            sessionId: session.id,
        };
    }

    async createPublicOnboardingCheckoutSession(
        dto: CreatePublicOnboardingCheckoutSessionDto,
    ): Promise<CheckoutSessionResponse> {
        const stripe = this.getStripeClient();
        const adminEmail = dto.adminEmail.trim().toLowerCase();
        const companyName = dto.companyName.trim();
        const adminFullName = dto.adminFullName.trim();
        const phone = dto.phone?.trim() || null;

        const plan = await this.planRepo.findOne({ where: { id: dto.planId } });
        if (!plan) {
            throw new NotFoundException(`Plan #${dto.planId} not found`);
        }
        if (!plan.isActive) {
            throw new BadRequestException(`Plan "${plan.name}" is not active`);
        }
        if (!plan.stripePriceId) {
            throw new BadRequestException(`Plan "${plan.name}" is not ready for online checkout`);
        }

        const existingUser = await this.userRepo.findOne({ where: { email: adminEmail } });
        if (existingUser) {
            throw new ConflictException(`Email "${adminEmail}" is already registered`);
        }

        const blockingSignup = await this.publicSignupRepo.findOne({
            where: [
                { adminEmail, status: In([PublicSignupStatus.PAID, PublicSignupStatus.COMPLETED]) },
                { companyName, status: In([PublicSignupStatus.PAID, PublicSignupStatus.COMPLETED]) },
            ],
            order: { createdAt: 'DESC' },
        });
        if (blockingSignup) {
            throw new ConflictException('A signup for this email or company has already been paid or completed');
        }

        const pendingSignup = await this.publicSignupRepo.findOne({
            where: [
                { adminEmail, status: PublicSignupStatus.PENDING_PAYMENT },
                { companyName, status: PublicSignupStatus.PENDING_PAYMENT },
            ],
            order: { createdAt: 'DESC' },
        });
        if (pendingSignup) {
            pendingSignup.status = PublicSignupStatus.EXPIRED;
            await this.publicSignupRepo.save(pendingSignup);
        }

        let customerId = pendingSignup?.stripeCustomerId ?? null;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: adminEmail,
                name: companyName,
                metadata: {
                    companyName,
                    adminEmail,
                },
            });
            customerId = customer.id;
        }
        if (!customerId) {
            throw new ServiceUnavailableException('Stripe did not return a customer ID');
        }

        const signup = await this.publicSignupRepo.save(this.publicSignupRepo.create({
            companyName,
            adminFullName,
            adminEmail,
            phone,
            planId: plan.id,
            plan,
            stripeCustomerId: customerId,
            status: PublicSignupStatus.PENDING_PAYMENT,
        }));

        const metadata = {
            onboardingId: String(signup.id),
            planId: String(plan.id),
            companyName,
            adminEmail,
        };

        const session = await stripe.checkout.sessions.create(this.buildCheckoutSessionParams(plan, {
            customer: customerId,
            successUrl: this.buildFrontendUrl('/onboarding/success', '?session_id={CHECKOUT_SESSION_ID}'),
            cancelUrl: this.buildFrontendUrl('/onboarding/cancel'),
            metadata,
        }));

        signup.stripeCheckoutSessionId = session.id;
        await this.publicSignupRepo.save(signup);

        if (!session.url) {
            throw new ServiceUnavailableException('Stripe did not return a checkout URL');
        }

        return {
            checkoutUrl: session.url,
            sessionId: session.id,
        };
    }

    private buildCheckoutSessionParams(
        plan: Plan,
        input: {
            customer: string;
            successUrl: string;
            cancelUrl: string;
            metadata: CheckoutMetadata;
        },
    ) {
        const shared = {
            customer: input.customer,
            line_items: [{ price: plan.stripePriceId, quantity: 1 }],
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            metadata: input.metadata,
        };

        if ((plan.billingType ?? PlanBillingType.RECURRING) === PlanBillingType.ONE_TIME) {
            return {
                ...shared,
                mode: 'payment',
                payment_intent_data: {
                    metadata: input.metadata,
                },
            };
        }

        return {
            ...shared,
            mode: 'subscription',
            subscription_data: {
                metadata: input.metadata,
            },
        };
    }

    async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<{ received: true }> {
        if (!rawBody) {
            throw new BadRequestException('Missing raw request body for Stripe webhook verification');
        }
        if (!signature) {
            throw new BadRequestException('Missing Stripe signature header');
        }

        const stripe = this.getStripeClient();
        const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
        if (!webhookSecret) {
            throw new ServiceUnavailableException('Stripe webhook secret is not configured');
        }

        let event: { type: string; data: { object: unknown } };
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid Stripe webhook signature';
            throw new BadRequestException(`Stripe webhook verification failed: ${message}`);
        }

        switch (event.type) {
            case 'checkout.session.completed':
                await this.handleCheckoutCompleted(event.data.object as StripeSessionPayload);
                break;
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                await this.handleStripeSubscription(event.data.object as StripeSubscriptionPayload);
                break;
            case 'invoice.payment_succeeded':
                await this.handleInvoice(event.data.object as StripeInvoicePayload, SubscriptionStatus.ACTIVE);
                break;
            case 'invoice.payment_failed':
                await this.handleInvoice(event.data.object as StripeInvoicePayload, SubscriptionStatus.PAST_DUE);
                break;
            default:
                this.logger.debug(`Ignoring Stripe event ${event.type}`);
        }

        return { received: true };
    }

    private getStripeClient(): any {
        if (this.stripeClient) {
            return this.stripeClient;
        }

        const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
        if (!secretKey) {
            throw new ServiceUnavailableException('Stripe is not configured. Set STRIPE_SECRET_KEY.');
        }

        this.stripeClient = new Stripe(secretKey, {
            appInfo: {
                name: 'Marriott Contracting SaaS',
            },
        });
        return this.stripeClient;
    }

    private async getOrCreateCustomer(stripe: any, tenant: Tenant): Promise<string> {
        if (tenant.stripeCustomerId) {
            return tenant.stripeCustomerId;
        }

        const customer = await stripe.customers.create({
            name: tenant.name,
            metadata: {
                tenantId: String(tenant.id),
            },
        });

        tenant.stripeCustomerId = customer.id;
        await this.tenantRepo.save(tenant);
        return customer.id;
    }

    private async createOrUpdatePendingSubscription(tenant: Tenant, plan: Plan): Promise<Subscription> {
        const today = this.toDateOnly(new Date());
        const subscription = await this.subscriptionRepo.findOne({
            where: { tenantId: tenant.id },
        }) ?? this.subscriptionRepo.create({ tenantId: tenant.id, tenant });

        subscription.planId = plan.id;
        subscription.plan = plan;
        subscription.status = SubscriptionStatus.PAST_DUE;
        subscription.currentPeriodStart = subscription.currentPeriodStart ?? today;
        subscription.currentPeriodEnd = subscription.currentPeriodEnd ?? null;
        subscription.monthlyPrice = Number(plan.monthlyPrice);
        subscription.currency = plan.currency;
        subscription.note = 'Checkout session created; awaiting Stripe confirmation.';

        return this.subscriptionRepo.save(subscription);
    }

    private async handleCheckoutCompleted(session: StripeSessionPayload): Promise<void> {
        const onboardingId = this.numberFromMetadata(session.metadata?.onboardingId);
        if (onboardingId) {
            await this.completePublicOnboarding(onboardingId, session);
            return;
        }

        const customerId = this.referenceId(session.customer);
        const stripeSubscriptionId = this.referenceId(session.subscription);
        const subscription = await this.findLocalSubscription({
            localSubscriptionId: this.numberFromMetadata(session.metadata?.localSubscriptionId),
            checkoutSessionId: session.id,
            stripeSubscriptionId,
            tenantId: this.numberFromMetadata(session.metadata?.tenantId),
        });

        if (session.metadata?.tenantId && customerId) {
            await this.storeTenantCustomerId(Number(session.metadata.tenantId), customerId);
        }

        if (!subscription) {
            this.logger.warn(`No local subscription matched checkout session ${session.id}`);
            return;
        }

        subscription.stripeCheckoutSessionId = session.id;
        if (stripeSubscriptionId) {
            subscription.stripeSubscriptionId = stripeSubscriptionId;
            await this.syncStripeSubscription(stripeSubscriptionId, subscription);
        } else {
            subscription.status = SubscriptionStatus.ACTIVE;
            await this.subscriptionRepo.save(subscription);
        }
    }

    private async completePublicOnboarding(onboardingId: number, session: StripeSessionPayload): Promise<void> {
        const signup = await this.publicSignupRepo.findOne({
            where: { id: onboardingId },
            relations: ['plan'],
        });

        if (!signup) {
            this.logger.warn(`No public signup matched checkout session ${session.id}`);
            return;
        }
        if (signup.status === PublicSignupStatus.COMPLETED) {
            this.logger.debug(`Public signup #${signup.id} already completed`);
            return;
        }
        if (signup.status === PublicSignupStatus.EXPIRED || signup.status === PublicSignupStatus.FAILED) {
            this.logger.warn(`Ignoring checkout session ${session.id} for ${signup.status.toLowerCase()} public signup #${signup.id}`);
            return;
        }

        signup.status = PublicSignupStatus.PAID;
        signup.stripeCheckoutSessionId = session.id;
        signup.stripeCustomerId = this.referenceId(session.customer) ?? signup.stripeCustomerId;
        await this.publicSignupRepo.save(signup);

        const existingUser = await this.userRepo.findOne({ where: { email: signup.adminEmail } });
        if (existingUser && existingUser.id !== signup.adminUserId) {
            signup.status = PublicSignupStatus.FAILED;
            await this.publicSignupRepo.save(signup);
            this.logger.error(`Cannot complete public signup #${signup.id}: email ${signup.adminEmail} is already registered`);
            return;
        }

        const tenant = await this.ensureOnboardingTenant(signup);
        signup.tenantId = tenant.id;
        signup.tenant = tenant;
        await this.publicSignupRepo.save(signup);

        const adminUser = await this.ensureOnboardingAdminUser(signup, tenant.id);
        signup.adminUserId = adminUser.id;
        signup.adminUser = adminUser;
        await this.publicSignupRepo.save(signup);

        await this.ensureOnboardingSubscription(signup, tenant, session);

        signup.status = PublicSignupStatus.COMPLETED;
        await this.publicSignupRepo.save(signup);
    }

    private async handleStripeSubscription(stripeSubscription: StripeSubscriptionPayload): Promise<void> {
        const subscription = await this.findLocalSubscription({
            localSubscriptionId: this.numberFromMetadata(stripeSubscription.metadata?.localSubscriptionId),
            stripeSubscriptionId: stripeSubscription.id,
            tenantId: this.numberFromMetadata(stripeSubscription.metadata?.tenantId),
        });

        if (!subscription) {
            this.logger.warn(`No local subscription matched Stripe subscription ${stripeSubscription.id}`);
            return;
        }

        await this.applyStripeSubscription(subscription, stripeSubscription);
    }

    private async handleInvoice(invoice: StripeInvoicePayload, status: SubscriptionStatus): Promise<void> {
        const stripeSubscriptionId = this.referenceId(invoice.subscription);
        if (!stripeSubscriptionId) {
            this.logger.debug(`Invoice ${invoice.id ?? 'unknown'} has no subscription reference`);
            return;
        }

        const subscription = await this.findLocalSubscription({ stripeSubscriptionId });
        if (!subscription) {
            this.logger.warn(`No local subscription matched invoice subscription ${stripeSubscriptionId}`);
            return;
        }

        subscription.status = status;
        await this.subscriptionRepo.save(subscription);
    }

    private async syncStripeSubscription(stripeSubscriptionId: string, subscription: Subscription): Promise<void> {
        try {
            const stripeSubscription = await this.getStripeClient().subscriptions.retrieve(stripeSubscriptionId);
            await this.applyStripeSubscription(subscription, stripeSubscription);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown Stripe subscription retrieval error';
            this.logger.warn(`Unable to retrieve Stripe subscription ${stripeSubscriptionId}: ${message}`);
            subscription.status = SubscriptionStatus.ACTIVE;
            await this.subscriptionRepo.save(subscription);
        }
    }

    private async applyStripeSubscription(
        subscription: Subscription,
        stripeSubscription: StripeSubscriptionPayload,
    ): Promise<void> {
        const periodEnd = this.unixDate(stripeSubscription.current_period_end);
        const periodStart = this.unixDate(stripeSubscription.current_period_start);
        const customerId = this.referenceId(stripeSubscription.customer);

        subscription.stripeSubscriptionId = stripeSubscription.id;
        subscription.status = mapStripeSubscriptionStatus(stripeSubscription.status);
        if (periodStart) {
            subscription.currentPeriodStart = this.toDateOnly(periodStart);
        }
        if (periodEnd) {
            subscription.stripeCurrentPeriodEnd = periodEnd;
            subscription.currentPeriodEnd = this.toDateOnly(periodEnd);
        }

        if (stripeSubscription.metadata?.planId) {
            const planId = Number(stripeSubscription.metadata.planId);
            if (Number.isInteger(planId)) {
                const plan = await this.planRepo.findOne({ where: { id: planId } });
                if (plan) {
                    subscription.planId = plan.id;
                    subscription.plan = plan;
                    subscription.monthlyPrice = Number(plan.monthlyPrice);
                    subscription.currency = plan.currency;
                }
            }
        }

        if (customerId) {
            await this.storeTenantCustomerId(subscription.tenantId, customerId);
        }

        await this.subscriptionRepo.save(subscription);
    }

    private async ensureOnboardingTenant(signup: PublicSignup): Promise<Tenant> {
        if (signup.tenantId) {
            const existingTenant = await this.tenantRepo.findOne({ where: { id: signup.tenantId } });
            if (existingTenant) {
                return existingTenant;
            }
        }

        return this.tenantRepo.save(this.tenantRepo.create({
            name: signup.companyName,
            isActive: true,
            stripeCustomerId: signup.stripeCustomerId,
        }));
    }

    private async ensureOnboardingAdminUser(signup: PublicSignup, tenantId: number): Promise<User> {
        if (signup.adminUserId) {
            const existingUser = await this.userRepo.findOne({ where: { id: signup.adminUserId } });
            if (existingUser) {
                return existingUser;
            }
        }

        const [firstName, lastName] = this.splitFullName(signup.adminFullName);
        const invitationToken = randomUUID();
        const adminUser = await this.userRepo.save(this.userRepo.create({
            email: signup.adminEmail,
            firstName,
            lastName,
            role: UserRole.ADMIN,
            tenantId,
            isActive: false,
            invitationToken,
        }));

        this.mailService.sendUserInvitation(signup.adminEmail, invitationToken);
        return adminUser;
    }

    private async ensureOnboardingSubscription(
        signup: PublicSignup,
        tenant: Tenant,
        session: StripeSessionPayload,
    ): Promise<Subscription> {
        const stripeSubscriptionId = this.referenceId(session.subscription);
        const existing = await this.findLocalSubscription({
            checkoutSessionId: session.id,
            stripeSubscriptionId,
            tenantId: tenant.id,
        });

        const subscription = existing ?? this.subscriptionRepo.create({
            tenantId: tenant.id,
            tenant,
        });

        subscription.planId = signup.planId;
        subscription.plan = signup.plan;
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.currentPeriodStart = subscription.currentPeriodStart ?? this.toDateOnly(new Date());
        subscription.monthlyPrice = Number(signup.plan.monthlyPrice);
        subscription.currency = signup.plan.currency;
        subscription.note = 'Created from public SaaS onboarding checkout.';
        subscription.stripeCheckoutSessionId = session.id;

        if (stripeSubscriptionId) {
            subscription.stripeSubscriptionId = stripeSubscriptionId;
            await this.syncStripeSubscription(stripeSubscriptionId, subscription);
            return subscription;
        }

        return this.subscriptionRepo.save(subscription);
    }

    private async findLocalSubscription(criteria: {
        localSubscriptionId?: number;
        checkoutSessionId?: string | null;
        stripeSubscriptionId?: string | null;
        tenantId?: number;
    }): Promise<Subscription | null> {
        if (criteria.localSubscriptionId) {
            const subscription = await this.subscriptionRepo.findOne({ where: { id: criteria.localSubscriptionId } });
            if (subscription) return subscription;
        }

        if (criteria.checkoutSessionId) {
            const subscription = await this.subscriptionRepo.findOne({
                where: { stripeCheckoutSessionId: criteria.checkoutSessionId },
            });
            if (subscription) return subscription;
        }

        if (criteria.stripeSubscriptionId) {
            const subscription = await this.subscriptionRepo.findOne({
                where: { stripeSubscriptionId: criteria.stripeSubscriptionId },
            });
            if (subscription) return subscription;
        }

        if (criteria.tenantId) {
            return this.subscriptionRepo.findOne({ where: { tenantId: criteria.tenantId } });
        }

        return null;
    }

    private async storeTenantCustomerId(tenantId: number, customerId: string): Promise<void> {
        const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
        if (!tenant || tenant.stripeCustomerId === customerId) {
            return;
        }

        tenant.stripeCustomerId = customerId;
        await this.tenantRepo.save(tenant);
    }

    private buildFrontendUrl(path: string, suffix = ''): string {
        const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
        const normalizedBase = frontendUrl.replace(/\/+$/, '');
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        return `${normalizedBase}${normalizedPath}${suffix}`;
    }

    private referenceId(value: StripeReference): string | null {
        if (!value) return null;
        if (typeof value === 'string') return value;
        return value.id ?? null;
    }

    private numberFromMetadata(value: string | null | undefined): number | undefined {
        if (!value) return undefined;
        const parsed = Number(value);
        return Number.isInteger(parsed) ? parsed : undefined;
    }

    private splitFullName(fullName: string): [string, string] {
        const parts = fullName.trim().split(/\s+/).filter(Boolean);
        const firstName = parts.shift() ?? fullName.trim();
        const lastName = parts.join(' ');
        return [firstName, lastName];
    }

    private unixDate(value: number | undefined): Date | null {
        return value ? new Date(value * 1000) : null;
    }

    private toDateOnly(date: Date): string {
        return date.toISOString().slice(0, 10);
    }
}
