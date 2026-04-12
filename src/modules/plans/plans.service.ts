import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

export interface PlanRecord {
    id: number;
    name: string;
    description: string;
    monthlyPrice: number;
    currency: string;
    maxHotels: number;
    maxUsers: number;
    apiAccess: boolean;
    supportTier: string;
    features: string[];
    isActive: boolean;
    updatedAt: string;
}

@Injectable()
export class PlansService {
    private nextId = 4;

    private readonly plans: PlanRecord[] = [
        {
            id: 1,
            name: 'Free',
            description: 'Entry plan for new organizations validating platform fit.',
            monthlyPrice: 0,
            currency: 'USD',
            maxHotels: 1,
            maxUsers: 5,
            apiAccess: false,
            supportTier: 'Community',
            features: ['1 hotel', '5 users', 'Community support'],
            isActive: true,
            updatedAt: '2026-04-01T08:00:00.000Z',
        },
        {
            id: 2,
            name: 'Pro',
            description: 'Growth tier with multi-property scale and API access.',
            monthlyPrice: 499,
            currency: 'USD',
            maxHotels: 10,
            maxUsers: 50,
            apiAccess: true,
            supportTier: 'Priority',
            features: ['10 hotels', '50 users', 'API access', 'Priority support'],
            isActive: true,
            updatedAt: '2026-04-04T10:30:00.000Z',
        },
        {
            id: 3,
            name: 'Enterprise',
            description: 'Unlimited scale with dedicated enablement and governance.',
            monthlyPrice: 0,
            currency: 'USD',
            maxHotels: 9999,
            maxUsers: 9999,
            apiAccess: true,
            supportTier: 'Dedicated',
            features: ['Unlimited hotels', 'Unlimited users', 'Dedicated API throughput', 'Success manager'],
            isActive: true,
            updatedAt: '2026-04-05T12:15:00.000Z',
        },
    ];

    findAll(): PlanRecord[] {
        return this.plans;
    }

    create(dto: CreatePlanDto): PlanRecord {
        const plan: PlanRecord = {
            id: this.nextId++,
            ...dto,
            isActive: dto.isActive ?? true,
            updatedAt: new Date().toISOString(),
        };
        this.plans.push(plan);
        return plan;
    }

    update(id: number, dto: UpdatePlanDto): PlanRecord {
        const plan = this.plans.find((item) => item.id === id);
        if (!plan) {
            throw new NotFoundException(`Plan #${id} not found`);
        }

        Object.assign(plan, dto, { updatedAt: new Date().toISOString() });
        return plan;
    }

    remove(id: number): { success: true } {
        const index = this.plans.findIndex((item) => item.id === id);
        if (index === -1) {
            throw new NotFoundException(`Plan #${id} not found`);
        }

        this.plans.splice(index, 1);
        return { success: true };
    }
}
