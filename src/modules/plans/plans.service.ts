import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { AuditLogCategory, AuditLogSeverity } from '../../common/audit/audit.types';
import { PlanBillingType, SubscriptionStatus } from '../../common/constants/enums';
import { RequestUser } from '../../common/interfaces/request.interface';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { Plan } from './entities/plan.entity';

export interface PlanRecord {
    id: number;
    name: string;
    description: string;
    monthlyPrice: number;
    billingType: PlanBillingType;
    currency: string;
    maxHotels: number;
    maxUsers: number;
    apiAccess: boolean;
    supportTier: string;
    features: string[];
    isActive: boolean;
    stripeProductId: string | null;
    stripePriceId: string | null;
    createdAt: string;
    updatedAt: string;
}

export type PublicPlanRecord = Pick<
    PlanRecord,
    | 'id'
    | 'name'
    | 'description'
    | 'monthlyPrice'
    | 'billingType'
    | 'currency'
    | 'maxHotels'
    | 'maxUsers'
    | 'apiAccess'
    | 'supportTier'
    | 'features'
> & {
    canSubscribe: boolean;
};

@Injectable()
export class PlansService {
    constructor(
        @InjectRepository(Plan)
        private readonly planRepo: Repository<Plan>,
        @InjectRepository(Subscription)
        private readonly subscriptionRepo: Repository<Subscription>,
        private readonly auditService: AuditService,
    ) { }

    async findAll(): Promise<PlanRecord[]> {
        const plans = await this.planRepo.find({ order: { monthlyPrice: 'ASC', id: 'ASC' } });
        return plans.map((plan) => this.toRecord(plan));
    }

    async findActivePublicPlans(): Promise<PublicPlanRecord[]> {
        const plans = await this.planRepo.find({
            where: { isActive: true },
            order: { monthlyPrice: 'ASC', id: 'ASC' },
        });
        return plans.map((plan) => this.toPublicRecord(plan));
    }

    async create(dto: CreatePlanDto, currentUser?: RequestUser): Promise<PlanRecord> {
        await this.ensureUniqueName(dto.name);

        const plan = this.planRepo.create({
            ...dto,
            billingType: dto.billingType ?? PlanBillingType.RECURRING,
            isActive: dto.isActive ?? true,
        });

        const saved = await this.planRepo.save(plan);
        await this.auditService.log({
            eventType: 'PLAN_CREATED',
            category: AuditLogCategory.PLAN,
            message: `Plan ${saved.name} was created`,
            actor: await this.auditService.resolveActor(currentUser),
            targetType: 'plan',
            targetId: saved.id,
            metadata: {
                billingType: saved.billingType,
                monthlyPrice: Number(saved.monthlyPrice),
                currency: saved.currency,
                isActive: saved.isActive,
                hasStripePriceId: Boolean(saved.stripePriceId),
            },
        });
        return this.toRecord(saved);
    }

    async update(id: number, dto: UpdatePlanDto, currentUser?: RequestUser): Promise<PlanRecord> {
        const plan = await this.planRepo.findOne({ where: { id } });
        if (!plan) {
            throw new NotFoundException(`Plan #${id} not found`);
        }

        if (dto.name !== undefined) {
            await this.ensureUniqueName(dto.name, id);
            plan.name = dto.name;
        }
        if (dto.description !== undefined) plan.description = dto.description;
        if (dto.monthlyPrice !== undefined) plan.monthlyPrice = dto.monthlyPrice;
        if (dto.billingType !== undefined) plan.billingType = dto.billingType;
        if (dto.currency !== undefined) plan.currency = dto.currency;
        if (dto.maxHotels !== undefined) plan.maxHotels = dto.maxHotels;
        if (dto.maxUsers !== undefined) plan.maxUsers = dto.maxUsers;
        if (dto.apiAccess !== undefined) plan.apiAccess = dto.apiAccess;
        if (dto.supportTier !== undefined) plan.supportTier = dto.supportTier;
        if (dto.features !== undefined) plan.features = dto.features;
        if (dto.isActive !== undefined) plan.isActive = dto.isActive;
        if (dto.stripeProductId !== undefined) plan.stripeProductId = dto.stripeProductId || null;
        if (dto.stripePriceId !== undefined) plan.stripePriceId = dto.stripePriceId || null;

        const saved = await this.planRepo.save(plan);
        await this.auditService.log({
            eventType: 'PLAN_UPDATED',
            category: AuditLogCategory.PLAN,
            message: `Plan ${saved.name} was updated`,
            actor: await this.auditService.resolveActor(currentUser),
            targetType: 'plan',
            targetId: saved.id,
            metadata: {
                changedFields: Object.keys(dto),
                billingType: saved.billingType,
                monthlyPrice: Number(saved.monthlyPrice),
                isActive: saved.isActive,
                hasStripePriceId: Boolean(saved.stripePriceId),
            },
        });
        return this.toRecord(saved);
    }

    async remove(id: number, currentUser?: RequestUser): Promise<{ success: true; deactivated?: true }> {
        const plan = await this.planRepo.findOne({ where: { id } });
        if (!plan) {
            throw new NotFoundException(`Plan #${id} not found`);
        }

        const activeSubscriptionCount = await this.subscriptionRepo.count({
            where: [
                { planId: id, status: SubscriptionStatus.ACTIVE },
                { planId: id, status: SubscriptionStatus.PAST_DUE },
            ],
        });

        if (activeSubscriptionCount > 0) {
            plan.isActive = false;
            await this.planRepo.save(plan);
            await this.auditService.log({
                eventType: 'PLAN_DEACTIVATED',
                category: AuditLogCategory.PLAN,
                severity: AuditLogSeverity.WARNING,
                message: `Plan ${plan.name} was deactivated because active subscriptions exist`,
                actor: await this.auditService.resolveActor(currentUser),
                targetType: 'plan',
                targetId: plan.id,
                metadata: { activeSubscriptionCount },
            });
            return { success: true, deactivated: true };
        }

        await this.planRepo.delete(id);
        await this.auditService.log({
            eventType: 'PLAN_DELETED',
            category: AuditLogCategory.PLAN,
            severity: AuditLogSeverity.WARNING,
            message: `Plan ${plan.name} was deleted`,
            actor: await this.auditService.resolveActor(currentUser),
            targetType: 'plan',
            targetId: plan.id,
        });
        return { success: true };
    }

    async findByName(name: string): Promise<Plan | null> {
        return this.planRepo.findOne({ where: { name } });
    }

    private async ensureUniqueName(name: string, currentPlanId?: number): Promise<void> {
        const existing = await this.planRepo.findOne({
            where: currentPlanId ? { name, id: Not(currentPlanId) } : { name },
        });

        if (existing) {
            throw new ConflictException(`Plan "${name}" already exists`);
        }
    }

    private toRecord(plan: Plan): PlanRecord {
        return {
            id: plan.id,
            name: plan.name,
            description: plan.description,
            monthlyPrice: Number(plan.monthlyPrice),
            billingType: plan.billingType ?? PlanBillingType.RECURRING,
            currency: plan.currency,
            maxHotels: plan.maxHotels,
            maxUsers: plan.maxUsers,
            apiAccess: plan.apiAccess,
            supportTier: plan.supportTier,
            features: plan.features ?? [],
            isActive: plan.isActive,
            stripeProductId: plan.stripeProductId ?? null,
            stripePriceId: plan.stripePriceId ?? null,
            createdAt: plan.createdAt.toISOString(),
            updatedAt: plan.updatedAt.toISOString(),
        };
    }

    private toPublicRecord(plan: Plan): PublicPlanRecord {
        return {
            id: plan.id,
            name: plan.name,
            description: plan.description,
            monthlyPrice: Number(plan.monthlyPrice),
            billingType: plan.billingType ?? PlanBillingType.RECURRING,
            currency: plan.currency,
            maxHotels: plan.maxHotels,
            maxUsers: plan.maxUsers,
            apiAccess: plan.apiAccess,
            supportTier: plan.supportTier,
            features: plan.features ?? [],
            canSubscribe: Boolean(plan.stripePriceId),
        };
    }
}
