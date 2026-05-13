import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { PlanBillingType, SubscriptionStatus } from '../../common/constants/enums';
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

    async create(dto: CreatePlanDto): Promise<PlanRecord> {
        await this.ensureUniqueName(dto.name);

        const plan = this.planRepo.create({
            ...dto,
            billingType: dto.billingType ?? PlanBillingType.RECURRING,
            isActive: dto.isActive ?? true,
        });

        return this.toRecord(await this.planRepo.save(plan));
    }

    async update(id: number, dto: UpdatePlanDto): Promise<PlanRecord> {
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

        return this.toRecord(await this.planRepo.save(plan));
    }

    async remove(id: number): Promise<{ success: true; deactivated?: true }> {
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
            return { success: true, deactivated: true };
        }

        await this.planRepo.delete(id);
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
