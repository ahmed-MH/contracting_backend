import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import { DataSource, EntityManager, FindOptionsWhere, In, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { AuditLogCategory, AuditLogSeverity } from '../../common/audit/audit.types';
import { PlanBillingType, PublicSignupStatus, SubscriptionStatus, UserRole } from '../../common/constants/enums';
import { RequestUser } from '../../common/interfaces/request.interface';
import { MailService } from '../mail/mail.service';
import { Plan } from '../plans/entities/plan.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreatePublicOnboardingCheckoutSessionDto } from './dto/create-public-onboarding-checkout-session.dto';
import { ListPublicSignupsQueryDto } from './dto/list-public-signups-query.dto';
import { PublicSignup } from './entities/public-signup.entity';
import { mapStripeSubscriptionStatus } from './utils/stripe-status.mapper';

export interface CheckoutSessionResponse {
    checkoutUrl: string;
    sessionId: string;
}

export interface CheckoutReconciliationResponse {
    alreadyProcessed?: boolean;
    requiresSync?: boolean;
    resolved: boolean;
    canRetry?: boolean;
    billingStatus: SubscriptionStatus;
    message: string;
    sessionStatus?: string | null;
    paymentStatus?: string | null;
}

export type CheckoutStartResponse = CheckoutSessionResponse | CheckoutReconciliationResponse;

export interface PublicSignupRecord {
    id: number;
    companyName: string;
    adminFullName: string;
    adminEmail: string;
    phone: string | null;
    planId: number;
    planName: string;
    billingType: PlanBillingType;
    status: PublicSignupStatus;
    failureReason: string | null;
    stripeCheckoutSessionId: string | null;
    tenantId: number | null;
    adminUserId: number | null;
    subscriptionId: number | null;
    tenant: { id: number; name: string; isActive: boolean } | null;
    adminUser: { id: number; name: string; email: string; isActive: boolean } | null;
    subscription: { id: number; status: SubscriptionStatus; planName: string } | null;
    checkout: { sessionIdPreview: string | null; hasSession: boolean };
    provisioningState: 'AWAITING_PAYMENT' | 'PAYMENT_RECEIVED' | 'PROVISIONED' | 'INCOMPLETE' | 'FAILED' | 'EXPIRED';
    isProvisioningIncomplete: boolean;
    provisioningIssues: string[];
    provisioningWarnings: string[];
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

type StripeReference = string | { id?: string } | null | undefined;

interface StripeSessionPayload {
    id: string;
    url?: string | null;
    customer?: StripeReference;
    subscription?: StripeReference;
    mode?: string | null;
    payment_status?: string | null;
    status?: string | null;
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

interface StripeSubscriptionSyncResult {
    subscription: StripeSubscriptionPayload | null;
    failureReason?: string;
}

@Injectable()
export class BillingService {
    private readonly logger = new Logger(BillingService.name);
    private stripeClient: any | null = null;

    constructor(
        private readonly configService: ConfigService,
        private readonly mailService: MailService,
        private readonly dataSource: DataSource,
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
        private readonly auditService: AuditService,
    ) { }

    async createCheckoutSession(dto: CreateCheckoutSessionDto, currentUser?: RequestUser): Promise<CheckoutStartResponse> {
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
            await this.auditService.log({
                eventType: 'PLAN_STRIPE_PRICE_ID_MISSING',
                category: AuditLogCategory.PLAN,
                severity: AuditLogSeverity.WARNING,
                message: `Checkout blocked because plan ${plan.name} has no Stripe Price ID`,
                actor: await this.auditService.resolveActor(currentUser),
                tenantId: tenant.id,
                tenantName: tenant.name,
                targetType: 'plan',
                targetId: plan.id,
            });
            throw new BadRequestException(`Plan "${plan.name}" does not have a Stripe price ID configured`);
        }

        const activeSubscription = await this.subscriptionRepo.findOne({
            where: {
                tenantId: tenant.id,
                planId: plan.id,
                status: SubscriptionStatus.ACTIVE,
            },
        });
        if (activeSubscription) {
            throw new ConflictException('Tenant already has active billing for this plan.');
        }

        const customerId = await this.getOrCreateCustomer(stripe, tenant);
        const checkoutPreparation = await this.preparePendingTenantCheckout(
            stripe,
            tenant,
            plan,
            'Checkout session created; awaiting Stripe confirmation.',
            'supervisor manual checkout',
            currentUser,
        );
        if (checkoutPreparation.reconciliation) {
            return checkoutPreparation.reconciliation;
        }
        const localSubscription = checkoutPreparation.subscription;
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
            subscriptionId: String(localSubscription.id),
            source: 'supervisor_manual_checkout',
            checkoutAttemptId: randomUUID(),
        };

        const session = await stripe.checkout.sessions.create(this.buildCheckoutSessionParams(plan, {
            customer: customerId,
            successUrl,
            cancelUrl,
            metadata,
        }));

        localSubscription.stripeCheckoutSessionId = session.id;
        await this.subscriptionRepo.save(localSubscription);
        await this.auditService.logBilling({
            eventType: 'SUPERVISOR_MANUAL_CHECKOUT_SESSION_CREATED',
            message: `Supervisor manual checkout session was created for ${tenant.name} on plan ${plan.name}`,
            actor: await this.auditService.resolveActor(currentUser),
            tenantId: tenant.id,
            tenantName: tenant.name,
            targetType: 'subscription',
            targetId: localSubscription.id,
            metadata: {
                planId: plan.id,
                planName: plan.name,
                billingType: plan.billingType,
                stripeCheckoutSessionId: session.id,
            },
        });

        if (!session.url) {
            throw new ServiceUnavailableException('Stripe did not return a checkout URL');
        }

        return {
            checkoutUrl: session.url,
            sessionId: session.id,
        };
    }

    async createTenantAdminCheckoutSession(
        user: RequestUser,
        dto: { planId: number },
    ): Promise<CheckoutStartResponse> {
        if (user.role !== UserRole.ADMIN) {
            throw new ForbiddenException('Only tenant administrators can manage billing for their organization.');
        }

        const currentUser = await this.userRepo.findOne({ where: { id: user.id }, relations: ['tenant'] });
        if (!currentUser || currentUser.role !== UserRole.ADMIN) {
            throw new ForbiddenException('Only tenant administrators can manage billing for their organization.');
        }
        if (!currentUser.tenantId || !currentUser.tenant) {
            throw new BadRequestException('Organization setup is required before choosing a plan.');
        }

        const stripe = this.getStripeClient();
        const tenant = await this.tenantRepo.findOne({ where: { id: currentUser.tenantId } });
        if (!tenant) {
            throw new NotFoundException(`Tenant #${currentUser.tenantId} not found`);
        }

        const plan = await this.planRepo.findOne({ where: { id: dto.planId } });
        if (!plan) {
            throw new NotFoundException(`Plan #${dto.planId} not found`);
        }
        if (!plan.isActive) {
            throw new BadRequestException(`Plan "${plan.name}" is not active`);
        }
        if (!plan.stripePriceId) {
            await this.auditService.log({
                eventType: 'PLAN_STRIPE_PRICE_ID_MISSING',
                category: AuditLogCategory.PLAN,
                severity: AuditLogSeverity.WARNING,
                message: `Tenant checkout blocked because plan ${plan.name} has no Stripe Price ID`,
                actor: await this.auditService.resolveActor(user),
                tenantId: tenant.id,
                tenantName: tenant.name,
                targetType: 'plan',
                targetId: plan.id,
            });
            throw new BadRequestException(`Plan "${plan.name}" is not ready for online checkout`);
        }

        const activeSubscription = await this.subscriptionRepo.findOne({
            where: {
                tenantId: tenant.id,
                planId: plan.id,
                status: SubscriptionStatus.ACTIVE,
            },
        });
        if (activeSubscription) {
            throw new ConflictException('You already have this plan active.');
        }

        const customerId = await this.getOrCreateCustomer(stripe, tenant);
        const checkoutPreparation = await this.preparePendingTenantCheckout(
            stripe,
            tenant,
            plan,
            'Tenant admin checkout session created; awaiting Stripe confirmation.',
            'tenant admin checkout',
            user,
        );
        if (checkoutPreparation.reconciliation) {
            return checkoutPreparation.reconciliation;
        }
        const localSubscription = checkoutPreparation.subscription;
        const metadata = {
            tenantId: String(tenant.id),
            planId: String(plan.id),
            subscriptionId: String(localSubscription.id),
            localSubscriptionId: String(localSubscription.id),
            source: 'tenant_admin_upgrade',
            checkoutAttemptId: randomUUID(),
        };

        const session = await stripe.checkout.sessions.create(this.buildCheckoutSessionParams(plan, {
            customer: customerId,
            successUrl: this.buildFrontendUrl('/profile/billing/success', '?session_id={CHECKOUT_SESSION_ID}'),
            cancelUrl: this.buildFrontendUrl('/profile/billing/cancel'),
            metadata,
        }));

        localSubscription.stripeCheckoutSessionId = session.id;
        await this.subscriptionRepo.save(localSubscription);
        await this.auditService.logBilling({
            eventType: 'TENANT_ADMIN_CHECKOUT_SESSION_CREATED',
            message: `Tenant admin checkout session was created for ${tenant.name} on plan ${plan.name}`,
            actor: await this.auditService.resolveActor(user),
            tenantId: tenant.id,
            tenantName: tenant.name,
            targetType: 'subscription',
            targetId: localSubscription.id,
            metadata: {
                planId: plan.id,
                planName: plan.name,
                billingType: plan.billingType,
                stripeCheckoutSessionId: session.id,
            },
        });

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
            await this.auditService.log({
                eventType: 'PLAN_STRIPE_PRICE_ID_MISSING',
                category: AuditLogCategory.PLAN,
                severity: AuditLogSeverity.WARNING,
                message: `Public onboarding checkout blocked because plan ${plan.name} has no Stripe Price ID`,
                targetType: 'plan',
                targetId: plan.id,
                metadata: { adminEmail, companyName },
            });
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
            relations: ['plan'],
            order: { createdAt: 'DESC' },
        });

        let previousCustomerId: string | null = null;
        if (pendingSignup) {
            previousCustomerId = await this.expirePendingPublicSignupCheckout(stripe, pendingSignup);
        }

        let customerId = previousCustomerId ?? pendingSignup?.stripeCustomerId ?? null;
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
        await this.auditService.logBilling({
            eventType: 'PUBLIC_ONBOARDING_CHECKOUT_SESSION_CREATED',
            message: `Public onboarding checkout session was created for ${companyName}`,
            actorRole: 'PUBLIC',
            actorEmail: adminEmail,
            targetType: 'public_signup',
            targetId: signup.id,
            metadata: {
                planId: plan.id,
                planName: plan.name,
                billingType: plan.billingType,
                stripeCheckoutSessionId: session.id,
                companyName,
                adminEmail,
            },
        });

        if (!session.url) {
            throw new ServiceUnavailableException('Stripe did not return a checkout URL');
        }

        return {
            checkoutUrl: session.url,
            sessionId: session.id,
        };
    }

    async listPublicSignups(query: ListPublicSignupsQueryDto = {}): Promise<PublicSignupRecord[]> {
        const limit = query.limit ?? 50;
        const page = query.page ?? 1;
        const where: FindOptionsWhere<PublicSignup> = {};
        if (query.status) {
            where.status = query.status;
        }

        const signups = await this.publicSignupRepo.find({
            where,
            relations: ['plan', 'tenant', 'adminUser', 'subscription', 'subscription.plan'],
            order: { createdAt: 'DESC' },
            take: limit,
            skip: (page - 1) * limit,
        });

        return signups.map((signup) => this.toPublicSignupRecord(signup));
    }

    async getPublicSignup(id: number): Promise<PublicSignupRecord> {
        const signup = await this.publicSignupRepo.findOne({
            where: { id },
            relations: ['plan', 'tenant', 'adminUser', 'subscription', 'subscription.plan'],
        });
        if (!signup) {
            throw new NotFoundException(`Public signup #${id} not found`);
        }

        return this.toPublicSignupRecord(signup);
    }

    private toPublicSignupRecord(signup: PublicSignup): PublicSignupRecord {
        const provisioningIssues = this.getPublicSignupProvisioningIssues(signup);
        const provisioningWarnings = this.getPublicSignupProvisioningWarnings(signup);
        const provisioningState = this.getPublicSignupProvisioningState(signup, provisioningIssues);
        const checkoutPreview = this.previewStripeReference(signup.stripeCheckoutSessionId);

        return {
            id: signup.id,
            companyName: signup.companyName,
            adminFullName: signup.adminFullName,
            adminEmail: signup.adminEmail,
            phone: signup.phone,
            planId: signup.planId,
            planName: signup.plan?.name ?? `Plan #${signup.planId}`,
            billingType: signup.plan?.billingType ?? PlanBillingType.RECURRING,
            status: signup.status,
            failureReason: signup.failureReason,
            stripeCheckoutSessionId: signup.stripeCheckoutSessionId,
            tenantId: signup.tenantId,
            adminUserId: signup.adminUserId,
            subscriptionId: signup.subscriptionId,
            tenant: signup.tenant
                ? {
                    id: signup.tenant.id,
                    name: signup.tenant.name,
                    isActive: signup.tenant.isActive,
                }
                : null,
            adminUser: signup.adminUser
                ? {
                    id: signup.adminUser.id,
                    name: this.formatUserDisplayName(signup.adminUser) ?? signup.adminFullName,
                    email: signup.adminUser.email,
                    isActive: signup.adminUser.isActive,
                }
                : null,
            subscription: signup.subscription
                ? {
                    id: signup.subscription.id,
                    status: signup.subscription.status,
                    planName: signup.subscription.plan?.name ?? signup.plan?.name ?? `Plan #${signup.subscription.planId}`,
                }
                : null,
            checkout: {
                sessionIdPreview: checkoutPreview,
                hasSession: Boolean(signup.stripeCheckoutSessionId),
            },
            provisioningState,
            isProvisioningIncomplete: provisioningIssues.length > 0,
            provisioningIssues,
            provisioningWarnings,
            completedAt: signup.completedAt,
            createdAt: signup.createdAt,
            updatedAt: signup.updatedAt,
        };
    }

    private getPublicSignupProvisioningIssues(signup: PublicSignup): string[] {
        if (signup.status !== PublicSignupStatus.COMPLETED) {
            return [];
        }

        const issues: string[] = [];
        if (!signup.tenantId || !signup.tenant) {
            issues.push('Tenant was not linked');
        }
        if (!signup.adminUserId || !signup.adminUser) {
            issues.push('Admin user was not linked');
        }
        if (!signup.subscriptionId || !signup.subscription) {
            issues.push('Subscription was not linked');
        }

        return issues;
    }

    private getPublicSignupProvisioningWarnings(signup: PublicSignup): string[] {
        if (signup.status !== PublicSignupStatus.COMPLETED) {
            return [];
        }

        return signup.completedAt ? [] : ['Completion timestamp missing'];
    }

    private getPublicSignupProvisioningState(
        signup: PublicSignup,
        provisioningIssues: string[],
    ): PublicSignupRecord['provisioningState'] {
        if (signup.status === PublicSignupStatus.FAILED) {
            return 'FAILED';
        }
        if (signup.status === PublicSignupStatus.EXPIRED) {
            return 'EXPIRED';
        }
        if (signup.status === PublicSignupStatus.PAID) {
            return 'PAYMENT_RECEIVED';
        }
        if (provisioningIssues.length > 0) {
            return 'INCOMPLETE';
        }
        if (signup.status === PublicSignupStatus.COMPLETED) {
            return 'PROVISIONED';
        }
        return 'AWAITING_PAYMENT';
    }

    private formatUserDisplayName(user: User): string | null {
        const name = [user.firstName, user.lastName]
            .map((part) => part?.trim())
            .filter(Boolean)
            .join(' ');

        return name || null;
    }

    private previewStripeReference(value: string | null): string | null {
        if (!value) {
            return null;
        }
        if (value.length <= 18) {
            return value;
        }

        return `${value.slice(0, 10)}...${value.slice(-6)}`;
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

    private async expirePendingPublicSignupCheckout(stripe: any, signup: PublicSignup): Promise<string | null> {
        if (!signup.stripeCheckoutSessionId) {
            signup.status = PublicSignupStatus.EXPIRED;
            await this.publicSignupRepo.save(signup);
            this.logger.log(`Expired pending public signup #${signup.id} without a Stripe checkout session`);
            return signup.stripeCustomerId;
        }

        let session: StripeSessionPayload;
        try {
            session = await stripe.checkout.sessions.retrieve(signup.stripeCheckoutSessionId);
        } catch (error) {
            const message = this.errorMessage(error);
            this.logger.warn(`Could not retrieve old checkout session ${signup.stripeCheckoutSessionId} for signup #${signup.id}: ${message}`);
            throw new ConflictException('A previous checkout is still being verified. Please try again shortly.');
        }

        const customerId = this.referenceId(session.customer) ?? signup.stripeCustomerId;
        if (this.canProvisionCheckoutSession(signup.plan, session)) {
            await this.completePublicOnboarding(signup.id, session);
            throw new ConflictException('A previous checkout for this email or company was already paid. Check the admin email for the activation link.');
        }

        if (session.status === 'expired') {
            signup.status = PublicSignupStatus.EXPIRED;
            signup.stripeCustomerId = customerId;
            await this.publicSignupRepo.save(signup);
            this.logger.log(`Marked already-expired checkout session ${session.id} as expired for public signup #${signup.id}`);
            return customerId;
        }

        try {
            await stripe.checkout.sessions.expire(signup.stripeCheckoutSessionId);
        } catch (error) {
            const message = this.errorMessage(error);
            if (this.isAlreadyExpiredStripeError(message)) {
                this.logger.log(`Checkout session ${signup.stripeCheckoutSessionId} was already expired for public signup #${signup.id}`);
            } else if (this.isCompletedStripeError(message)) {
                const refreshed = await stripe.checkout.sessions.retrieve(signup.stripeCheckoutSessionId);
                if (this.canProvisionCheckoutSession(signup.plan, refreshed)) {
                    await this.completePublicOnboarding(signup.id, refreshed);
                    throw new ConflictException('A previous checkout for this email or company was already paid. Check the admin email for the activation link.');
                }

                this.logger.warn(`Checkout session ${signup.stripeCheckoutSessionId} completed but is not paid; refusing to create a competing session`);
                throw new ConflictException('A previous checkout is still being processed. Please try again shortly.');
            } else {
                this.logger.warn(`Could not expire old checkout session ${signup.stripeCheckoutSessionId} for signup #${signup.id}: ${message}`);
                throw new ConflictException('A previous checkout session is still active. Please finish it or try again shortly.');
            }
        }

        signup.status = PublicSignupStatus.EXPIRED;
        signup.stripeCustomerId = customerId;
        await this.publicSignupRepo.save(signup);
        this.logger.log(`Expired old checkout session ${signup.stripeCheckoutSessionId} for public signup #${signup.id}`);
        return customerId;
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

        let event: { id?: string; type: string; data: { object: unknown } };
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid Stripe webhook signature';
            await this.auditService.logWebhook({
                eventType: 'STRIPE_WEBHOOK_SIGNATURE_FAILED',
                severity: AuditLogSeverity.ERROR,
                message: 'Stripe webhook failed signature verification',
                actorRole: 'STRIPE_WEBHOOK',
                metadata: { reason: message },
            });
            throw new BadRequestException(`Stripe webhook verification failed: ${message}`);
        }

        await this.auditService.logWebhook({
            eventType: 'STRIPE_WEBHOOK_RECEIVED',
            message: `Stripe webhook received: ${event.type}`,
            actorRole: 'STRIPE_WEBHOOK',
            targetType: 'stripe_event',
            targetId: event.id ?? null,
            metadata: { stripeEventType: event.type },
        });

        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded':
                await this.handleCheckoutCompleted(event.data.object as StripeSessionPayload, event.id);
                break;
            case 'checkout.session.async_payment_failed':
                await this.handleCheckoutPaymentFailed(event.data.object as StripeSessionPayload, event.id);
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
                await this.auditService.logWebhook({
                    eventType: 'STRIPE_WEBHOOK_IGNORED',
                    severity: AuditLogSeverity.WARNING,
                    message: `Stripe webhook ignored: ${event.type}`,
                    actorRole: 'STRIPE_WEBHOOK',
                    targetType: 'stripe_event',
                    targetId: event.id ?? null,
                    metadata: { stripeEventType: event.type },
                });
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

    private async preparePendingTenantCheckout(
        stripe: any,
        tenant: Tenant,
        plan: Plan,
        note: string,
        context: string,
        currentUser?: RequestUser,
    ): Promise<{ subscription: Subscription; reconciliation?: undefined } | { subscription?: undefined; reconciliation: CheckoutReconciliationResponse }> {
        const existingSubscription = await this.subscriptionRepo.findOne({
            where: { tenantId: tenant.id },
            relations: ['tenant', 'plan'],
        });

        const reconciliation = await this.expirePreviousTenantCheckoutIfOpen(stripe, existingSubscription, context, currentUser);
        if (reconciliation && (!reconciliation.canRetry || reconciliation.resolved)) {
            return { reconciliation };
        }

        return {
            subscription: await this.createOrUpdatePendingSubscription(tenant, plan, note, existingSubscription),
        };
    }

    private async createOrUpdatePendingSubscription(
        tenant: Tenant,
        plan: Plan,
        note = 'Checkout session created; awaiting Stripe confirmation.',
        existingSubscription?: Subscription | null,
    ): Promise<Subscription> {
        const today = this.toDateOnly(new Date());
        const subscription = existingSubscription ?? await this.subscriptionRepo.findOne({
            where: { tenantId: tenant.id },
        }) ?? this.subscriptionRepo.create({ tenantId: tenant.id, tenant });

        subscription.planId = plan.id;
        subscription.plan = plan;
        subscription.status = SubscriptionStatus.PAST_DUE;
        subscription.currentPeriodStart = subscription.currentPeriodStart ?? today;
        subscription.currentPeriodEnd = subscription.currentPeriodEnd ?? null;
        subscription.monthlyPrice = Number(plan.monthlyPrice);
        subscription.currency = plan.currency;
        subscription.note = note;

        return this.subscriptionRepo.save(subscription);
    }

    private async expirePreviousTenantCheckoutIfOpen(
        stripe: any,
        subscription: Subscription | null | undefined,
        context: string,
        currentUser?: RequestUser,
    ): Promise<CheckoutReconciliationResponse | null> {
        if (!subscription?.stripeCheckoutSessionId) {
            return null;
        }

        let previousSession: StripeSessionPayload;
        try {
            previousSession = await stripe.checkout.sessions.retrieve(subscription.stripeCheckoutSessionId);
        } catch (error) {
            const message = this.errorMessage(error);
            this.logger.warn(`Could not retrieve previous ${context} session ${subscription.stripeCheckoutSessionId}: ${message}`);
            subscription.status = SubscriptionStatus.PAST_DUE;
            subscription.note = `Stripe checkout retrieval failed: ${message}`;
            await this.subscriptionRepo.save(subscription);
            await this.auditCheckoutReconciliationKeptPastDue(subscription, context, message);
            return this.checkoutReconciliationResult(subscription, {
                resolved: false,
                requiresSync: true,
                message: 'Stripe checkout could not be retrieved. Try checking payment status again in a moment.',
            });
        }

        if (this.isCheckoutSessionPaid(previousSession) || previousSession.status === 'complete') {
            const reconciliation = await this.reconcileSubscriptionCheckoutRecord(subscription, previousSession, context, currentUser);
            return reconciliation.canRetry && !reconciliation.resolved ? null : reconciliation;
        }

        if (previousSession.status === 'expired') {
            return null;
        }

        try {
            await stripe.checkout.sessions.expire(subscription.stripeCheckoutSessionId);
            this.logger.log(`Expired previous ${context} session ${subscription.stripeCheckoutSessionId}`);
        } catch (error) {
            const message = this.errorMessage(error);
            if (this.isAlreadyExpiredStripeError(message)) {
                this.logger.log(`Previous ${context} session ${subscription.stripeCheckoutSessionId} was already expired`);
                return null;
            }
            if (this.isCompletedStripeError(message)) {
                const reconciliation = await this.reconcileSubscriptionCheckoutRecord(subscription, null, context, currentUser);
                return reconciliation.canRetry && !reconciliation.resolved ? null : reconciliation;
            }
            this.logger.warn(`Could not expire previous ${context} session ${subscription.stripeCheckoutSessionId}: ${message}`);
            throw new ConflictException('A previous checkout session is still active. Please finish it or try again shortly.');
        }

        return null;
    }

    async syncCurrentTenantCheckout(user: RequestUser): Promise<CheckoutReconciliationResponse> {
        if (user.role !== UserRole.ADMIN) {
            throw new ForbiddenException('Only tenant administrators can sync billing for their organization.');
        }

        const currentUser = await this.userRepo.findOne({ where: { id: user.id }, relations: ['tenant'] });
        if (!currentUser || currentUser.role !== UserRole.ADMIN) {
            throw new ForbiddenException('Only tenant administrators can sync billing for their organization.');
        }
        if (!currentUser.tenantId || !currentUser.tenant) {
            throw new BadRequestException('Organization setup is required before syncing billing.');
        }

        const subscription = await this.subscriptionRepo.findOne({
            where: { tenantId: currentUser.tenantId },
            relations: ['tenant', 'plan'],
            order: { updatedAt: 'DESC' },
        });
        if (!subscription) {
            throw new BadRequestException('No subscription is available to sync.');
        }

        return this.reconcileSubscriptionCheckoutRecord(subscription, null, 'tenant admin payment sync', user);
    }

    private async reconcileSubscriptionCheckoutRecord(
        subscription: Subscription,
        preloadedSession: StripeSessionPayload | null,
        context: string,
        currentUser?: RequestUser,
    ): Promise<CheckoutReconciliationResponse> {
        const hydrated = await this.subscriptionRepo.findOne({
            where: { id: subscription.id },
            relations: ['tenant', 'plan'],
        }) ?? subscription;

        await this.auditService.logBilling({
            eventType: 'CHECKOUT_RECONCILIATION_REQUESTED',
            message: `Checkout reconciliation requested for subscription #${hydrated.id}`,
            actor: await this.auditService.resolveActor(currentUser),
            tenantId: hydrated.tenantId,
            tenantName: hydrated.tenant?.name ?? null,
            targetType: 'subscription',
            targetId: hydrated.id,
            metadata: {
                context,
                stripeCheckoutSessionId: hydrated.stripeCheckoutSessionId,
                status: hydrated.status,
            },
        });

        if (!hydrated.stripeCheckoutSessionId) {
            return this.checkoutReconciliationResult(hydrated, {
                resolved: false,
                canRetry: true,
                message: 'No previous checkout session is available to sync. You can retry checkout.',
            });
        }

        let session = preloadedSession;
        if (!session) {
            try {
                session = await this.getStripeClient().checkout.sessions.retrieve(hydrated.stripeCheckoutSessionId);
            } catch (error) {
                const message = this.errorMessage(error);
                hydrated.status = SubscriptionStatus.PAST_DUE;
                hydrated.note = `Stripe checkout retrieval failed: ${message}`;
                await this.subscriptionRepo.save(hydrated);
                await this.auditCheckoutReconciliationKeptPastDue(hydrated, context, message);
                return this.checkoutReconciliationResult(hydrated, {
                    resolved: false,
                    requiresSync: true,
                    message: 'Stripe checkout could not be retrieved. Try checking payment status again in a moment.',
                });
            }
        }

        const checkoutSession = session;
        if (!checkoutSession) {
            return this.checkoutReconciliationResult(hydrated, {
                resolved: false,
                requiresSync: true,
                message: 'Stripe checkout could not be retrieved. Try checking payment status again in a moment.',
            });
        }

        if (!this.checkoutSessionBelongsToSubscription(hydrated, checkoutSession)) {
            await this.auditCheckoutReconciliationKeptPastDue(hydrated, context, 'Checkout session metadata did not match the subscription.');
            return this.checkoutReconciliationResult(hydrated, {
                resolved: false,
                requiresSync: true,
                message: 'The previous checkout session does not match this subscription. Contact support.',
                session: checkoutSession,
            });
        }

        if (!this.isCheckoutSessionPaid(checkoutSession) && checkoutSession.status !== 'complete') {
            return this.checkoutReconciliationResult(hydrated, {
                resolved: false,
                canRetry: true,
                message: 'Payment has not been confirmed yet. You can retry checkout.',
                session: checkoutSession,
            });
        }

        const plan = hydrated.plan ?? await this.planRepo.findOne({ where: { id: hydrated.planId } });
        const billingType = plan?.billingType ?? PlanBillingType.RECURRING;

        if (billingType === PlanBillingType.ONE_TIME || checkoutSession.mode === 'payment') {
            if (this.isCheckoutSessionPaid(checkoutSession)) {
                hydrated.status = SubscriptionStatus.ACTIVE;
                hydrated.stripeCheckoutSessionId = checkoutSession.id;
                hydrated.stripeSubscriptionId = null;
                hydrated.note = 'Payment confirmed from Stripe checkout reconciliation.';
                await this.subscriptionRepo.save(hydrated);
                await this.auditCheckoutReconciliationActivated(hydrated, context, checkoutSession);
                return this.checkoutReconciliationResult(hydrated, {
                    resolved: true,
                    alreadyProcessed: true,
                    message: 'Payment confirmed and billing activated.',
                    session: checkoutSession,
                });
            }

            hydrated.status = SubscriptionStatus.PAST_DUE;
            hydrated.note = 'Stripe checkout completed without confirmed payment.';
            await this.subscriptionRepo.save(hydrated);
            await this.auditCheckoutReconciliationKeptPastDue(hydrated, context, hydrated.note);
            return this.checkoutReconciliationResult(hydrated, {
                resolved: false,
                canRetry: true,
                message: 'Stripe checkout completed, but payment was not confirmed. You can retry checkout.',
                session: checkoutSession,
            });
        }

        const stripeSubscriptionId = this.referenceId(checkoutSession.subscription);
        if (!stripeSubscriptionId) {
            hydrated.status = SubscriptionStatus.PAST_DUE;
            hydrated.note = 'Stripe checkout completed without a subscription reference; awaiting Stripe subscription confirmation.';
            hydrated.stripeCheckoutSessionId = checkoutSession.id;
            await this.subscriptionRepo.save(hydrated);
            await this.auditCheckoutReconciliationKeptPastDue(hydrated, context, hydrated.note);
            return this.checkoutReconciliationResult(hydrated, {
                resolved: false,
                requiresSync: true,
                message: 'Stripe checkout completed, but the recurring subscription is still being confirmed.',
                session: checkoutSession,
            });
        }

        hydrated.stripeCheckoutSessionId = checkoutSession.id;
        hydrated.stripeSubscriptionId = stripeSubscriptionId;
        try {
            const stripeSubscription = await this.getStripeClient().subscriptions.retrieve(stripeSubscriptionId);
            await this.applyStripeSubscription(hydrated, stripeSubscription);
        } catch (error) {
            const message = this.errorMessage(error);
            hydrated.status = SubscriptionStatus.PAST_DUE;
            hydrated.note = `Stripe subscription retrieval failed: ${message}`;
            await this.subscriptionRepo.save(hydrated);
            await this.auditCheckoutReconciliationKeptPastDue(hydrated, context, message);
            return this.checkoutReconciliationResult(hydrated, {
                resolved: false,
                requiresSync: true,
                message: 'Stripe subscription could not be confirmed yet. Try checking payment status again in a moment.',
                session: checkoutSession,
            });
        }

        if (hydrated.status === SubscriptionStatus.ACTIVE) {
            await this.auditCheckoutReconciliationActivated(hydrated, context, checkoutSession);
            return this.checkoutReconciliationResult(hydrated, {
                resolved: true,
                alreadyProcessed: true,
                message: 'Payment confirmed and billing activated.',
                session: checkoutSession,
            });
        }

        await this.auditCheckoutReconciliationKeptPastDue(hydrated, context, `Stripe subscription status mapped to ${hydrated.status}.`);
        return this.checkoutReconciliationResult(hydrated, {
            resolved: false,
            requiresSync: true,
            message: 'Stripe subscription is not active yet. Billing remains payment required.',
            session: checkoutSession,
        });
    }

    private checkoutSessionBelongsToSubscription(subscription: Subscription, session: StripeSessionPayload): boolean {
        const metadata = session.metadata ?? {};
        const metadataSubscriptionId = this.numberFromMetadata(metadata.subscriptionId)
            ?? this.numberFromMetadata(metadata.localSubscriptionId);
        const metadataTenantId = this.numberFromMetadata(metadata.tenantId);
        const metadataPlanId = this.numberFromMetadata(metadata.planId);

        if (metadataSubscriptionId && metadataSubscriptionId !== subscription.id) return false;
        if (metadataTenantId && metadataTenantId !== subscription.tenantId) return false;
        if (metadataPlanId && metadataPlanId !== subscription.planId) return false;
        return session.id === subscription.stripeCheckoutSessionId;
    }

    private checkoutReconciliationResult(
        subscription: Subscription,
        input: {
            resolved: boolean;
            message: string;
            session?: StripeSessionPayload;
            alreadyProcessed?: boolean;
            requiresSync?: boolean;
            canRetry?: boolean;
        },
    ): CheckoutReconciliationResponse {
        return {
            resolved: input.resolved,
            alreadyProcessed: input.alreadyProcessed,
            requiresSync: input.requiresSync,
            canRetry: input.canRetry,
            billingStatus: subscription.status,
            message: input.message,
            sessionStatus: input.session?.status ?? null,
            paymentStatus: input.session?.payment_status ?? null,
        };
    }

    private async auditCheckoutReconciliationActivated(
        subscription: Subscription,
        context: string,
        session: StripeSessionPayload,
    ): Promise<void> {
        await this.auditService.logBilling({
            eventType: 'CHECKOUT_RECONCILIATION_ACTIVATED',
            message: `Checkout reconciliation activated subscription #${subscription.id}`,
            actorRole: 'STRIPE_SYNC',
            tenantId: subscription.tenantId,
            tenantName: subscription.tenant?.name ?? null,
            targetType: 'subscription',
            targetId: subscription.id,
            metadata: {
                context,
                stripeCheckoutSessionId: session.id,
                stripeSubscriptionId: this.referenceId(session.subscription),
            },
        });
    }

    private async auditCheckoutReconciliationKeptPastDue(
        subscription: Subscription,
        context: string,
        reason: string,
    ): Promise<void> {
        await this.auditService.logBilling({
            eventType: 'CHECKOUT_RECONCILIATION_KEPT_PAST_DUE',
            severity: AuditLogSeverity.WARNING,
            message: `Checkout reconciliation kept subscription #${subscription.id} as ${subscription.status}`,
            actorRole: 'STRIPE_SYNC',
            tenantId: subscription.tenantId,
            tenantName: subscription.tenant?.name ?? null,
            targetType: 'subscription',
            targetId: subscription.id,
            metadata: { context, reason },
        });
    }

    private async handleCheckoutCompleted(session: StripeSessionPayload, stripeEventId?: string): Promise<void> {
        if (session.metadata?.source === 'tenant_admin_upgrade') {
            await this.completeTenantAdminUpgrade(session);
            return;
        }

        const onboardingId = this.numberFromMetadata(session.metadata?.onboardingId);
        if (onboardingId) {
            await this.completePublicOnboarding(onboardingId, session, stripeEventId);
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

        if (!subscription) {
            this.logger.warn(`No local subscription matched checkout session ${session.id}`);
            return;
        }
        if (!this.isCurrentCheckoutSession(subscription, session, 'supervisor manual checkout')) {
            return;
        }

        if (session.metadata?.tenantId && customerId) {
            await this.storeTenantCustomerId(Number(session.metadata.tenantId), customerId);
        }

        subscription.stripeCheckoutSessionId = session.id;
        if (stripeSubscriptionId) {
            subscription.stripeSubscriptionId = stripeSubscriptionId;
            await this.syncStripeSubscription(stripeSubscriptionId, subscription);
        } else {
            await this.activateCheckoutWithoutStripeSubscription(subscription, session);
        }
        await this.auditService.logWebhook({
            eventType: 'CHECKOUT_SESSION_COMPLETED',
            message: `Supervisor manual checkout completed for subscription #${subscription.id}`,
            actorRole: 'STRIPE_WEBHOOK',
            tenantId: subscription.tenantId,
            targetType: 'subscription',
            targetId: subscription.id,
            metadata: {
                stripeCheckoutSessionId: session.id,
                stripeSubscriptionId,
                source: session.metadata?.source ?? 'supervisor_manual_checkout',
            },
        });
    }

    private async completeTenantAdminUpgrade(session: StripeSessionPayload): Promise<void> {
        const tenantId = this.numberFromMetadata(session.metadata?.tenantId);
        const planId = this.numberFromMetadata(session.metadata?.planId);
        if (!tenantId || !planId) {
            this.logger.warn(`Tenant admin checkout session ${session.id} is missing tenant or plan metadata`);
            return;
        }

        const [tenant, plan] = await Promise.all([
            this.tenantRepo.findOne({ where: { id: tenantId } }),
            this.planRepo.findOne({ where: { id: planId } }),
        ]);
        if (!tenant || !plan) {
            this.logger.warn(`Tenant admin checkout session ${session.id} references a missing tenant or plan`);
            return;
        }

        if ((plan.billingType ?? PlanBillingType.RECURRING) === PlanBillingType.ONE_TIME && !this.isCheckoutSessionPaid(session)) {
            this.logger.warn(`Tenant admin one-time checkout session ${session.id} is not paid yet; activation deferred`);
            return;
        }

        const stripeSubscriptionId = this.referenceId(session.subscription);
        const subscription = await this.findLocalSubscription({
            localSubscriptionId: this.numberFromMetadata(session.metadata?.subscriptionId)
                ?? this.numberFromMetadata(session.metadata?.localSubscriptionId),
            checkoutSessionId: session.id,
            stripeSubscriptionId,
            tenantId,
        }) ?? this.subscriptionRepo.create({ tenantId, tenant });

        if (!this.isCurrentCheckoutSession(subscription, session, 'tenant admin checkout')) {
            return;
        }

        subscription.tenantId = tenant.id;
        subscription.tenant = tenant;
        subscription.planId = plan.id;
        subscription.plan = plan;
        subscription.status = SubscriptionStatus.PAST_DUE;
        subscription.currentPeriodStart = subscription.currentPeriodStart ?? this.toDateOnly(new Date());
        subscription.monthlyPrice = Number(plan.monthlyPrice);
        subscription.currency = plan.currency;
        subscription.note = 'Activated from tenant admin upgrade checkout.';
        subscription.stripeCheckoutSessionId = session.id;

        const customerId = this.referenceId(session.customer);
        if (customerId) {
            await this.storeTenantCustomerId(tenant.id, customerId);
        }

        if (stripeSubscriptionId) {
            subscription.stripeSubscriptionId = stripeSubscriptionId;
            await this.syncStripeSubscription(stripeSubscriptionId, subscription);
            await this.auditService.logWebhook({
                eventType: 'CHECKOUT_SESSION_COMPLETED',
                message: `Tenant admin checkout completed for ${tenant.name}`,
                actorRole: 'STRIPE_WEBHOOK',
                tenantId: tenant.id,
                tenantName: tenant.name,
                targetType: 'subscription',
                targetId: subscription.id,
                metadata: { stripeCheckoutSessionId: session.id, stripeSubscriptionId, source: 'tenant_admin_upgrade' },
            });
            return;
        }

        await this.activateCheckoutWithoutStripeSubscription(subscription, session, plan);
        await this.auditService.logWebhook({
            eventType: 'CHECKOUT_SESSION_COMPLETED',
            message: `Tenant admin checkout completed for ${tenant.name}`,
            actorRole: 'STRIPE_WEBHOOK',
            tenantId: tenant.id,
            tenantName: tenant.name,
            targetType: 'subscription',
            targetId: subscription.id,
            metadata: { stripeCheckoutSessionId: session.id, source: 'tenant_admin_upgrade' },
        });
    }

    private async handleCheckoutPaymentFailed(session: StripeSessionPayload, stripeEventId?: string): Promise<void> {
        const onboardingId = this.numberFromMetadata(session.metadata?.onboardingId);
        if (!onboardingId) {
            this.logger.debug(`Ignoring async payment failure for non-onboarding checkout session ${session.id}`);
            return;
        }

        await this.publicSignupRepo.update(onboardingId, {
            status: PublicSignupStatus.FAILED,
            stripeCheckoutSessionId: session.id,
            lastStripeEventId: stripeEventId ?? null,
            failureReason: 'Stripe checkout async payment failed.',
        });
        await this.auditService.logWebhook({
            eventType: 'PUBLIC_ONBOARDING_FAILED',
            severity: AuditLogSeverity.ERROR,
            message: `Public onboarding #${onboardingId} failed after Stripe async payment failure`,
            actorRole: 'STRIPE_WEBHOOK',
            targetType: 'public_signup',
            targetId: onboardingId,
            metadata: { stripeCheckoutSessionId: session.id, stripeEventId },
        });
        this.logger.warn(`Public signup #${onboardingId} marked failed after Stripe async payment failure`);
    }

    private isCurrentCheckoutSession(
        subscription: Subscription,
        session: StripeSessionPayload,
        context: string,
    ): boolean {
        if (!subscription.stripeCheckoutSessionId || subscription.stripeCheckoutSessionId === session.id) {
            return true;
        }

        this.logger.warn(
            `Ignoring stale ${context} session ${session.id}; subscription #${subscription.id} currently expects ${subscription.stripeCheckoutSessionId}`,
        );
        void this.auditService.logWebhook({
            eventType: 'STRIPE_WEBHOOK_STALE_CHECKOUT_IGNORED',
            severity: AuditLogSeverity.WARNING,
            message: `Stale ${context} checkout session was ignored`,
            actorRole: 'STRIPE_WEBHOOK',
            tenantId: subscription.tenantId,
            targetType: 'subscription',
            targetId: subscription.id,
            metadata: {
                stripeCheckoutSessionId: session.id,
                expectedStripeCheckoutSessionId: subscription.stripeCheckoutSessionId,
                context,
            },
        });
        return false;
    }

    private async activateCheckoutWithoutStripeSubscription(
        subscription: Subscription,
        session: StripeSessionPayload,
        plan?: Plan | null,
    ): Promise<void> {
        const resolvedPlan = plan
            ?? subscription.plan
            ?? await this.planRepo.findOne({ where: { id: subscription.planId } });
        const billingType = resolvedPlan?.billingType ?? PlanBillingType.RECURRING;

        if (billingType === PlanBillingType.RECURRING) {
            subscription.status = SubscriptionStatus.PAST_DUE;
            subscription.note = 'Stripe checkout completed without a subscription reference; awaiting Stripe subscription confirmation.';
            await this.subscriptionRepo.save(subscription);
            this.logger.warn(`Recurring checkout session ${session.id} completed without a Stripe subscription reference`);
            return;
        }

        if (!this.isCheckoutSessionPaid(session)) {
            this.logger.warn(`One-time checkout session ${session.id} is not paid yet; activation deferred`);
            return;
        }

        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.stripeSubscriptionId = null;
        await this.subscriptionRepo.save(subscription);
        await this.auditService.log({
            eventType: 'ONE_TIME_PAYMENT_ACTIVATED',
            category: AuditLogCategory.SUBSCRIPTION,
            message: `One-time payment activated subscription #${subscription.id}`,
            actorRole: 'STRIPE_WEBHOOK',
            tenantId: subscription.tenantId,
            targetType: 'subscription',
            targetId: subscription.id,
            metadata: { stripeCheckoutSessionId: session.id },
        });
    }

    private async retrieveRecurringStripeSubscriptionForCheckout(
        plan: Plan,
        session: StripeSessionPayload,
    ): Promise<StripeSubscriptionSyncResult> {
        if ((plan.billingType ?? PlanBillingType.RECURRING) === PlanBillingType.ONE_TIME) {
            return { subscription: null };
        }

        const stripeSubscriptionId = this.referenceId(session.subscription);
        if (!stripeSubscriptionId) {
            const failureReason = 'Stripe checkout completed without a subscription reference; awaiting Stripe subscription confirmation.';
            this.logger.warn(`Recurring checkout session ${session.id} completed without a Stripe subscription reference`);
            return { subscription: null, failureReason };
        }

        try {
            const subscription = await this.getStripeClient().subscriptions.retrieve(stripeSubscriptionId);
            return { subscription };
        } catch (error) {
            const message = this.errorMessage(error);
            const failureReason = `Stripe subscription retrieval failed: ${message}`;
            this.logger.warn(`Unable to retrieve Stripe subscription ${stripeSubscriptionId}: ${message}`);
            return { subscription: null, failureReason };
        }
    }

    private async completePublicOnboarding(onboardingId: number, session: StripeSessionPayload, stripeEventId?: string): Promise<void> {
        const signup = await this.publicSignupRepo.findOne({
            where: { id: onboardingId },
            relations: ['plan'],
        });

        if (!signup) {
            this.logger.warn(`No public signup matched checkout session ${session.id}`);
            return;
        }
        if (signup.status === PublicSignupStatus.COMPLETED && signup.tenantId && signup.adminUserId && signup.subscriptionId) {
            this.logger.debug(`Public signup #${signup.id} already completed`);
            return;
        }
        if (signup.status === PublicSignupStatus.EXPIRED && !this.canProvisionCheckoutSession(signup.plan, session)) {
            this.logger.warn(`Ignoring checkout session ${session.id} for ${signup.status.toLowerCase()} public signup #${signup.id}`);
            return;
        }
        if (signup.status === PublicSignupStatus.FAILED) {
            this.logger.warn(`Ignoring checkout session ${session.id} for failed public signup #${signup.id}`);
            return;
        }
        if (!this.canProvisionCheckoutSession(signup.plan, session)) {
            this.logger.warn(`Checkout session ${session.id} for public signup #${signup.id} is not paid yet; provisioning deferred`);
            return;
        }

        const stripeSubscriptionSync = await this.retrieveRecurringStripeSubscriptionForCheckout(signup.plan, session);

        const invitation = await this.dataSource.transaction((manager) =>
            this.completePublicOnboardingInTransaction(manager, onboardingId, session, stripeEventId, stripeSubscriptionSync),
        );

        if (invitation) {
            this.mailService.sendUserInvitation(invitation.email, invitation.token);
        }

        await this.auditService.logWebhook({
            eventType: 'PUBLIC_ONBOARDING_COMPLETED',
            message: `Public signup #${onboardingId} completed from Stripe checkout`,
            actorRole: 'STRIPE_WEBHOOK',
            tenantId: signup.tenantId,
            tenantName: signup.companyName,
            targetType: 'public_signup',
            targetId: signup.id,
            metadata: {
                stripeCheckoutSessionId: session.id,
                planId: signup.planId,
                billingType: signup.plan.billingType,
                adminEmail: signup.adminEmail,
                stripeEventId,
            },
        });
        this.logger.log(`Public signup #${onboardingId} completed from Stripe checkout session ${session.id}`);
    }

    private async completePublicOnboardingInTransaction(
        manager: EntityManager,
        onboardingId: number,
        session: StripeSessionPayload,
        stripeEventId?: string,
        stripeSubscriptionSync?: StripeSubscriptionSyncResult,
    ): Promise<{ email: string; token: string } | null> {
        const signupRepo = manager.getRepository(PublicSignup);

        const signup = await signupRepo.findOne({
            where: { id: onboardingId },
            relations: ['plan'],
        });
        if (!signup) {
            this.logger.warn(`No public signup matched checkout session ${session.id}`);
            return null;
        }
        if (signup.status === PublicSignupStatus.COMPLETED && signup.tenantId && signup.adminUserId && signup.subscriptionId) {
            this.logger.debug(`Duplicate Stripe webhook ignored for completed public signup #${signup.id}`);
            return null;
        }
        if (signup.status === PublicSignupStatus.FAILED) {
            this.logger.warn(`Public signup #${signup.id} is failed; webhook completion skipped`);
            return null;
        }

        signup.status = PublicSignupStatus.PAID;
        signup.stripeCheckoutSessionId = session.id;
        signup.stripeCustomerId = this.referenceId(session.customer) ?? signup.stripeCustomerId;
        signup.lastStripeEventId = stripeEventId ?? signup.lastStripeEventId;
        signup.failureReason = null;
        await signupRepo.save(signup);

        if (!signup.adminUserId) {
            const existingEmailUser = await manager.getRepository(User).findOne({ where: { email: signup.adminEmail } });
            if (
                existingEmailUser
                && (!signup.tenantId || existingEmailUser.tenantId !== signup.tenantId || existingEmailUser.role !== UserRole.ADMIN)
            ) {
                signup.status = PublicSignupStatus.FAILED;
                signup.failureReason = `Email "${signup.adminEmail}" is already registered to another user or tenant.`;
                await signupRepo.save(signup);
                this.logger.error(`Cannot complete public signup #${signup.id}: ${signup.failureReason}`);
                return null;
            }
        }

        const tenant = await this.ensureOnboardingTenantInTransaction(manager, signup);
        signup.tenantId = tenant.id;
        signup.tenant = tenant;
        await signupRepo.save(signup);

        const adminResult = await this.ensureOnboardingAdminUserInTransaction(manager, signup, tenant.id);
        if (!adminResult.user) {
            signup.status = PublicSignupStatus.FAILED;
            signup.failureReason = adminResult.failureReason ?? 'Unable to create onboarding admin user.';
            await signupRepo.save(signup);
            this.logger.error(`Cannot complete public signup #${signup.id}: ${signup.failureReason}`);
            return null;
        }

        signup.adminUserId = adminResult.user.id;
        signup.adminUser = adminResult.user;
        await signupRepo.save(signup);

        const subscription = await this.ensureOnboardingSubscriptionInTransaction(
            manager,
            signup,
            tenant,
            session,
            stripeSubscriptionSync,
        );

        signup.subscriptionId = subscription.id;
        signup.subscription = subscription;
        signup.status = PublicSignupStatus.COMPLETED;
        signup.completedAt = signup.completedAt ?? new Date();
        signup.lastStripeEventId = stripeEventId ?? signup.lastStripeEventId;
        signup.failureReason = null;
        await signupRepo.save(signup);

        return adminResult.invitationToken
            ? { email: signup.adminEmail, token: adminResult.invitationToken }
            : null;
    }

    private async ensureOnboardingTenantInTransaction(
        manager: EntityManager,
        signup: PublicSignup,
    ): Promise<Tenant> {
        const tenantRepo = manager.getRepository(Tenant);
        if (signup.tenantId) {
            const existingTenant = await tenantRepo.findOne({ where: { id: signup.tenantId } });
            if (existingTenant) {
                return existingTenant;
            }
        }

        return tenantRepo.save(tenantRepo.create({
            name: signup.companyName,
            isActive: true,
            stripeCustomerId: signup.stripeCustomerId,
        }));
    }

    private async ensureOnboardingAdminUserInTransaction(
        manager: EntityManager,
        signup: PublicSignup,
        tenantId: number,
    ): Promise<{ user: User | null; invitationToken?: string; failureReason?: string }> {
        const userRepo = manager.getRepository(User);
        if (signup.adminUserId) {
            const existingUser = await userRepo.findOne({ where: { id: signup.adminUserId } });
            if (existingUser) {
                return { user: existingUser };
            }
        }

        const existingEmailUser = await userRepo.findOne({ where: { email: signup.adminEmail } });
        if (existingEmailUser) {
            if (existingEmailUser.tenantId === tenantId && existingEmailUser.role === UserRole.ADMIN) {
                return { user: existingEmailUser };
            }

            return {
                user: null,
                failureReason: `Email "${signup.adminEmail}" is already registered to another user or tenant.`,
            };
        }

        const [firstName, lastName] = this.splitFullName(signup.adminFullName);
        const invitationToken = randomUUID();
        const adminUser = await userRepo.save(userRepo.create({
            email: signup.adminEmail,
            firstName,
            lastName,
            role: UserRole.ADMIN,
            tenantId,
            isActive: false,
            invitationToken,
        }));

        return { user: adminUser, invitationToken };
    }

    private async ensureOnboardingSubscriptionInTransaction(
        manager: EntityManager,
        signup: PublicSignup,
        tenant: Tenant,
        session: StripeSessionPayload,
        stripeSubscriptionSync?: StripeSubscriptionSyncResult,
    ): Promise<Subscription> {
        const subscriptionRepo = manager.getRepository(Subscription);
        const stripeSubscriptionId = this.referenceId(session.subscription);
        const existing = signup.subscriptionId
            ? await subscriptionRepo.findOne({ where: { id: signup.subscriptionId } })
            : await this.findLocalSubscriptionInTransaction(manager, {
                checkoutSessionId: session.id,
                stripeSubscriptionId,
                tenantId: tenant.id,
            });

        const subscription = existing ?? subscriptionRepo.create({
            tenantId: tenant.id,
            tenant,
        });

        subscription.planId = signup.planId;
        subscription.plan = signup.plan;
        subscription.currentPeriodStart = subscription.currentPeriodStart ?? this.toDateOnly(new Date());
        subscription.monthlyPrice = Number(signup.plan.monthlyPrice);
        subscription.currency = signup.plan.currency;
        subscription.note = 'Created from public SaaS onboarding checkout.';
        subscription.stripeCheckoutSessionId = session.id;

        if ((signup.plan.billingType ?? PlanBillingType.RECURRING) === PlanBillingType.ONE_TIME) {
            subscription.status = SubscriptionStatus.ACTIVE;
            subscription.stripeSubscriptionId = null;
            return subscriptionRepo.save(subscription);
        }

        if (stripeSubscriptionSync?.subscription) {
            this.applyStripeSubscriptionFields(subscription, stripeSubscriptionSync.subscription);
        } else {
            subscription.status = SubscriptionStatus.PAST_DUE;
            subscription.stripeSubscriptionId = stripeSubscriptionId;
            subscription.note = stripeSubscriptionSync?.failureReason
                ?? 'Stripe subscription confirmation is pending for this recurring checkout.';
        }

        return subscriptionRepo.save(subscription);
    }

    private async findLocalSubscriptionInTransaction(
        manager: EntityManager,
        criteria: {
            checkoutSessionId?: string | null;
            stripeSubscriptionId?: string | null;
            tenantId?: number;
        },
    ): Promise<Subscription | null> {
        const subscriptionRepo = manager.getRepository(Subscription);
        if (criteria.checkoutSessionId) {
            const subscription = await subscriptionRepo.findOne({
                where: { stripeCheckoutSessionId: criteria.checkoutSessionId },
            });
            if (subscription) return subscription;
        }

        if (criteria.stripeSubscriptionId) {
            const subscription = await subscriptionRepo.findOne({
                where: { stripeSubscriptionId: criteria.stripeSubscriptionId },
            });
            if (subscription) return subscription;
        }

        if (criteria.tenantId) {
            return subscriptionRepo.findOne({ where: { tenantId: criteria.tenantId } });
        }

        return null;
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
        await this.auditService.logWebhook({
            eventType: stripeSubscription.status === 'deleted' || stripeSubscription.status === 'canceled'
                ? 'STRIPE_SUBSCRIPTION_CANCELED'
                : 'RECURRING_SUBSCRIPTION_ACTIVATED',
            severity: stripeSubscription.status === 'deleted' || stripeSubscription.status === 'canceled'
                ? AuditLogSeverity.WARNING
                : AuditLogSeverity.INFO,
            message: `Stripe subscription ${stripeSubscription.id} synced as ${subscription.status}`,
            actorRole: 'STRIPE_WEBHOOK',
            tenantId: subscription.tenantId,
            targetType: 'subscription',
            targetId: subscription.id,
            metadata: {
                stripeSubscriptionId: stripeSubscription.id,
                stripeStatus: stripeSubscription.status,
                localStatus: subscription.status,
            },
        });
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
        await this.auditService.logWebhook({
            eventType: status === SubscriptionStatus.ACTIVE ? 'SUBSCRIPTION_ACTIVATED' : 'INVOICE_PAYMENT_FAILED',
            severity: status === SubscriptionStatus.ACTIVE ? AuditLogSeverity.INFO : AuditLogSeverity.ERROR,
            message: status === SubscriptionStatus.ACTIVE
                ? `Invoice payment succeeded for subscription #${subscription.id}`
                : `Invoice payment failed for subscription #${subscription.id}`,
            actorRole: 'STRIPE_WEBHOOK',
            tenantId: subscription.tenantId,
            targetType: 'subscription',
            targetId: subscription.id,
            metadata: { stripeInvoiceId: invoice.id ?? null, stripeSubscriptionId },
        });
    }

    private async syncStripeSubscription(stripeSubscriptionId: string, subscription: Subscription): Promise<void> {
        try {
            const stripeSubscription = await this.getStripeClient().subscriptions.retrieve(stripeSubscriptionId);
            await this.applyStripeSubscription(subscription, stripeSubscription);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown Stripe subscription retrieval error';
            this.logger.warn(`Unable to retrieve Stripe subscription ${stripeSubscriptionId}: ${message}`);
            subscription.status = SubscriptionStatus.PAST_DUE;
            subscription.note = `Stripe subscription retrieval failed: ${message}`;
            await this.subscriptionRepo.save(subscription);
        }
    }

    private async applyStripeSubscription(
        subscription: Subscription,
        stripeSubscription: StripeSubscriptionPayload,
    ): Promise<void> {
        const customerId = this.referenceId(stripeSubscription.customer);

        this.applyStripeSubscriptionFields(subscription, stripeSubscription);

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

    private applyStripeSubscriptionFields(
        subscription: Subscription,
        stripeSubscription: StripeSubscriptionPayload,
    ): void {
        const periodEnd = this.unixDate(stripeSubscription.current_period_end);
        const periodStart = this.unixDate(stripeSubscription.current_period_start);

        subscription.stripeSubscriptionId = stripeSubscription.id;
        subscription.status = mapStripeSubscriptionStatus(stripeSubscription.status);
        if (periodStart) {
            subscription.currentPeriodStart = this.toDateOnly(periodStart);
        }
        if (periodEnd) {
            subscription.stripeCurrentPeriodEnd = periodEnd;
            subscription.currentPeriodEnd = this.toDateOnly(periodEnd);
        }
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

    private canProvisionCheckoutSession(plan: Plan, session: StripeSessionPayload): boolean {
        if ((plan.billingType ?? PlanBillingType.RECURRING) === PlanBillingType.ONE_TIME) {
            return this.isCheckoutSessionPaid(session);
        }

        return session.status === 'complete' || this.isCheckoutSessionPaid(session);
    }

    private isCheckoutSessionPaid(session: StripeSessionPayload): boolean {
        return session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
    }

    private isAlreadyExpiredStripeError(message: string): boolean {
        return message.toLowerCase().includes('expired');
    }

    private isCompletedStripeError(message: string): boolean {
        const normalized = message.toLowerCase();
        return normalized.includes('complete') || normalized.includes('completed') || normalized.includes('paid');
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : 'Unknown Stripe error';
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
