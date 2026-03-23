import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ContractSpo } from './contract-spo.entity';
import { ContractRoom } from '../../core/entities/contract-room.entity';

@Entity({ name: 'contract_spo_rooms' })
export class ContractSpoRoom {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => ContractSpo, (spo) => spo.applicableContractRooms, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({ name: 'contractSpoId' })
    contractSpo: ContractSpo;

    @ManyToOne(() => ContractRoom, { onDelete: 'NO ACTION', nullable: false })
    @JoinColumn({ name: 'contractRoomId' })
    contractRoom: ContractRoom;
}
