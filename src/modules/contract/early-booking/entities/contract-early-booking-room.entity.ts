import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ContractEarlyBooking } from './contract-early-booking.entity';
import { ContractRoom } from '../../core/entities/contract-room.entity';

@Entity('contract_early_booking_rooms')
export class ContractEarlyBookingRoom {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => ContractEarlyBooking, (ceb: ContractEarlyBooking) => ceb.applicableContractRooms, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({ name: 'contractEarlyBookingId' })
    contractEarlyBooking: ContractEarlyBooking;

    // We use NO ACTION to avoid MS SQL multiple cascade paths issue
    @ManyToOne(() => ContractRoom, { onDelete: 'NO ACTION', nullable: false })
    @JoinColumn({ name: 'contractRoomId' })
    contractRoom: ContractRoom;
}
