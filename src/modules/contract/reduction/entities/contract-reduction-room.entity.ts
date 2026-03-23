import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ContractReduction } from './contract-reduction.entity';
import { ContractRoom } from '../../core/entities/contract-room.entity';

/**
 * Explicit junction entity for ContractReduction ↔ ContractRoom.
 * Using @ManyToOne (not @ManyToMany) gives us full control over onDelete,
 * which is required to avoid MSSQL multi-path cascade cycle errors.
 */
@Entity({ name: 'contract_reduction_rooms' })
export class ContractReductionRoom {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => ContractReduction, (cr) => cr.applicableContractRooms, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({ name: 'contractReductionId' })
    contractReduction: ContractReduction;

    // NO ACTION to break the MSSQL cascade cycle
    @ManyToOne(() => ContractRoom, {
        onDelete: 'NO ACTION',
        nullable: false,
    })
    @JoinColumn({ name: 'contractRoomId' })
    contractRoom: ContractRoom;
}
