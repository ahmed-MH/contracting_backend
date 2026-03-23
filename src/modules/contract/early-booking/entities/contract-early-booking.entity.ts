import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
} from 'typeorm';
import { Contract } from '../../core/entities/contract.entity';
import { ContractEarlyBookingRoom } from './contract-early-booking-room.entity';
import { ContractEarlyBookingPeriod } from './contract-early-booking-period.entity';
import { ReductionCalculationType, PricingModifierApplicationType } from '../../../../common/constants/enums';

@Entity('contract_early_booking')
export class ContractEarlyBooking {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    reference: string;

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

    @ManyToOne(() => Contract, (contract: Contract) => contract.earlyBookings, {
        onDelete: 'CASCADE',
    })
    contract: Contract;

    // From which template it was cloned
    @Column({ nullable: true })
    templateId: number;

    // Targeting
    @OneToMany(() => ContractEarlyBookingRoom, (cebr: ContractEarlyBookingRoom) => cebr.contractEarlyBooking, {
        cascade: true,
        eager: false,
    })
    applicableContractRooms: ContractEarlyBookingRoom[];

    @OneToMany(() => ContractEarlyBookingPeriod, (cebp: ContractEarlyBookingPeriod) => cebp.contractEarlyBooking, {
        cascade: true,
        eager: false,
    })
    applicablePeriods: ContractEarlyBookingPeriod[];
}
