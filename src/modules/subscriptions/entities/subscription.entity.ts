import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { SubscriptionStatus } from '../../../common/constants/enums';
import { Plan } from '../../plans/entities/plan.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

@Entity('saas_subscription')
export class Subscription {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Tenant, (tenant) => tenant.subscriptions, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenantId' })
    tenant: Tenant;

    @Column({ type: 'int' })
    tenantId: number;

    @ManyToOne(() => Plan, (plan) => plan.subscriptions, { nullable: false, onDelete: 'NO ACTION' })
    @JoinColumn({ name: 'planId' })
    plan: Plan;

    @Column({ type: 'int' })
    planId: number;

    @Column({ type: 'varchar', length: 20, default: SubscriptionStatus.ACTIVE })
    status: SubscriptionStatus;

    @Column({ type: 'date', nullable: true })
    currentPeriodStart: string | null;

    @Column({ type: 'date', nullable: true })
    currentPeriodEnd: string | null;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    monthlyPrice: number;

    @Column({ length: 3, default: 'USD' })
    currency: string;

    @Column({ type: 'nvarchar', length: 1000, nullable: true })
    note: string | null;

    @Column({ type: 'nvarchar', length: 255, nullable: true })
    stripeSubscriptionId: string | null;

    @Column({ type: 'nvarchar', length: 255, nullable: true })
    stripeCheckoutSessionId: string | null;

    @Column({ type: 'datetime2', nullable: true })
    stripeCurrentPeriodEnd: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
