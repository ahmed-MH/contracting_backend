import { Entity, PrimaryGeneratedColumn, ManyToOne, Column, JoinColumn } from 'typeorm';
import { ContractEarlyBooking } from './contract-early-booking.entity';
import { Period } from '../../core/entities/period.entity';

@Entity('contract_early_booking_periods')
export class ContractEarlyBookingPeriod {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => ContractEarlyBooking, (ceb: ContractEarlyBooking) => ceb.applicablePeriods, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({ name: 'contractEarlyBookingId' })
    contractEarlyBooking: ContractEarlyBooking;

    // We use NO ACTION to avoid MS SQL multiple cascade paths issue
    @ManyToOne(() => Period, { onDelete: 'NO ACTION', nullable: false })
    @JoinColumn({ name: 'periodId' })
    period: Period;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    overrideValue: number | null;
}
