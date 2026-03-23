import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    DeleteDateColumn,
    JoinColumn
} from 'typeorm';
import { Hotel } from '../../../hotel/entities/hotel.entity';
import { ReductionCalculationType, PricingModifierApplicationType } from '../../../../common/constants/enums';

@Entity('template_early_booking')
export class TemplateEarlyBooking {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    reference: string;

    @ManyToOne(() => Hotel, (hotel: Hotel) => hotel.templateEarlyBookings, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'hotelId' })
    hotel: Hotel;

    @Column()
    hotelId: number;

    @Column({ length: 255 })
    name: string;

    @Column({
        type: 'simple-enum',
        enum: ReductionCalculationType,
        default: ReductionCalculationType.PERCENTAGE,
    })
    calculationType: ReductionCalculationType;

    @Column('decimal', { precision: 10, scale: 2, default: 0 })
    value: number;

    @Column({
        type: 'simple-enum',
        enum: PricingModifierApplicationType,
        default: PricingModifierApplicationType.PER_NIGHT_PER_ROOM,
    })
    applicationType: PricingModifierApplicationType;

    @Column({ type: 'int', default: 0 })
    releaseDays: number;

    // ZONE A: Booking & Stay Windows
    @Column({ type: 'date', nullable: true })
    bookingWindowStart: Date | null;

    @Column({ type: 'date', nullable: true })
    bookingWindowEnd: Date | null;

    @Column({ type: 'date', nullable: true })
    stayWindowStart: Date | null;

    @Column({ type: 'date', nullable: true })
    stayWindowEnd: Date | null;

    // ZONE B: Prepaid conditions
    @Column({ default: false })
    isPrepaid: boolean;

    @Column('decimal', { precision: 10, scale: 2, nullable: true })
    prepaymentPercentage: number | null;

    @Column({ type: 'date', nullable: true })
    prepaymentDeadlineDate: Date | null;

    @Column({ type: 'date', nullable: true })
    roomingListDeadlineDate: Date | null;

    @DeleteDateColumn()
    deletedAt: Date;
}
