import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PlanBillingType } from '../../../common/constants/enums';
import { Subscription } from '../../subscriptions/entities/subscription.entity';

@Entity('saas_plan')
export class Plan {
    @PrimaryGeneratedColumn()
    id: number;

    @Index({ unique: true })
    @Column({ length: 255 })
    name: string;

    @Column({ type: 'nvarchar', length: 1000 })
    description: string;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    monthlyPrice: number;

    @Column({ type: 'varchar', length: 20, default: PlanBillingType.RECURRING })
    billingType: PlanBillingType;

    @Column({ length: 3, default: 'USD' })
    currency: string;

    @Column({ type: 'int' })
    maxHotels: number;

    @Column({ type: 'int' })
    maxUsers: number;

    @Column({ default: false })
    apiAccess: boolean;

    @Column({ length: 100 })
    supportTier: string;

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        transformer: {
            to: (value: string[]) => JSON.stringify(value ?? []),
            from: (value: string | null): string[] => (value ? JSON.parse(value) as string[] : []),
        },
    })
    features: string[];

    @Column({ default: true })
    isActive: boolean;

    @Column({ type: 'nvarchar', length: 255, nullable: true })
    stripeProductId: string | null;

    @Column({ type: 'nvarchar', length: 255, nullable: true })
    stripePriceId: string | null;

    @OneToMany(() => Subscription, (subscription) => subscription.plan)
    subscriptions: Subscription[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
