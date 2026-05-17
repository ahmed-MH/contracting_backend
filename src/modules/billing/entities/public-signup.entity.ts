import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { PublicSignupStatus } from '../../../common/constants/enums';
import { Plan } from '../../plans/entities/plan.entity';
import { Subscription } from '../../subscriptions/entities/subscription.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { User } from '../../users/entities/user.entity';

@Entity('public_signup')
export class PublicSignup {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'nvarchar', length: 255 })
    companyName: string;

    @Column({ type: 'nvarchar', length: 255 })
    adminFullName: string;

    @Index()
    @Column({ type: 'nvarchar', length: 255 })
    adminEmail: string;

    @Column({ type: 'nvarchar', length: 50, nullable: true })
    phone: string | null;

    @ManyToOne(() => Plan, { nullable: false, onDelete: 'NO ACTION' })
    @JoinColumn({ name: 'planId' })
    plan: Plan;

    @Column({ type: 'int' })
    planId: number;

    @Index()
    @Column({ type: 'nvarchar', length: 255, nullable: true })
    stripeCheckoutSessionId: string | null;

    @Column({ type: 'nvarchar', length: 255, nullable: true })
    stripeCustomerId: string | null;

    @Column({ type: 'varchar', length: 30, default: PublicSignupStatus.PENDING_PAYMENT })
    status: PublicSignupStatus;

    @ManyToOne(() => Tenant, { nullable: true, onDelete: 'NO ACTION' })
    @JoinColumn({ name: 'tenantId' })
    tenant: Tenant | null;

    @Column({ type: 'int', nullable: true })
    tenantId: number | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'NO ACTION' })
    @JoinColumn({ name: 'adminUserId' })
    adminUser: User | null;

    @Column({ type: 'int', nullable: true })
    adminUserId: number | null;

    @ManyToOne(() => Subscription, { nullable: true, onDelete: 'NO ACTION' })
    @JoinColumn({ name: 'subscriptionId' })
    subscription: Subscription | null;

    @Column({ type: 'int', nullable: true })
    subscriptionId: number | null;

    @Column({ type: 'datetime2', nullable: true })
    completedAt: Date | null;

    @Index()
    @Column({ type: 'nvarchar', length: 255, nullable: true })
    lastStripeEventId: string | null;

    @Column({ type: 'nvarchar', length: 1000, nullable: true })
    failureReason: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
