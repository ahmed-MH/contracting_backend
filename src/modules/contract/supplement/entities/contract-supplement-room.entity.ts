import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ContractSupplement } from './contract-supplement.entity';
import { ContractRoom } from '../../core/entities/contract-room.entity';

/**
 * Explicit junction entity for ContractSupplement ↔ ContractRoom.
 * Using @ManyToOne (not @ManyToMany) gives us full control over onDelete,
 * which is required to avoid MSSQL multi-path cascade cycle errors.
 */
@Entity({ name: 'contract_supplement_rooms' })
export class ContractSupplementRoom {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => ContractSupplement, (cs) => cs.applicableContractRooms, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({ name: 'contractSupplementId' })
    contractSupplement: ContractSupplement;

    // NO ACTION to break the MSSQL cascade cycle:
    // Contract──CASCADE──►ContractRoom and
    // Contract──CASCADE──►ContractSupplement──►contract_supplement_rooms──►ContractRoom
    // would be two paths to ContractRoom from Contract.
    @ManyToOne(() => ContractRoom, {
        onDelete: 'NO ACTION',
        nullable: false,
    })
    @JoinColumn({ name: 'contractRoomId' })
    contractRoom: ContractRoom;
}
