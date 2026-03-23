import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    DeleteDateColumn,
} from 'typeorm';
import { Hotel } from '../../../hotel/entities/hotel.entity';
import { BaseRateType, ChildSurchargeBase } from '../../../../common/constants/enums';

@Entity()
export class TemplateMonoparentalRule {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    reference: string;

    @Column()
    name: string;

    // ─── Zone A: Condition (Trigger) ─────────────────────────────────
    @Column({ type: 'int' })
    adultCount: number;

    @Column({ type: 'int' })
    childCount: number;

    @Column({ type: 'decimal', precision: 5, scale: 2 })
    minAge: number;

    @Column({ type: 'decimal', precision: 5, scale: 2 })
    maxAge: number;

    // ─── Zone B: Pricing Formula ─────────────────────────────────────
    @Column({
        type: 'simple-enum',
        enum: BaseRateType,
        default: BaseRateType.SINGLE,
    })
    baseRateType: BaseRateType;

    @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
    childSurchargePercentage: number;

    @Column({
        type: 'simple-enum',
        enum: ChildSurchargeBase,
        default: ChildSurchargeBase.HALF_DOUBLE,
    })
    childSurchargeBase: ChildSurchargeBase;

    // ─── Multi-tenant scoping ────────────────────────────────────────
    @ManyToOne(() => Hotel, { onDelete: 'CASCADE' })
    hotel: Hotel;

    @Column()
    hotelId: number;

    @DeleteDateColumn()
    deletedAt: Date;
}
