import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ContractMonoparentalRule } from './contract-monoparental-rule.entity';
import { ContractRoom } from '../../core/entities/contract-room.entity';

@Entity({ name: 'contract_monoparental_rule_rooms' })
export class ContractMonoparentalRuleRoom {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => ContractMonoparentalRule, (r) => r.applicableContractRooms, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({ name: 'contractMonoparentalRuleId' })
    contractMonoparentalRule: ContractMonoparentalRule;

    // NO ACTION to avoid MSSQL cascade cycle
    @ManyToOne(() => ContractRoom, {
        onDelete: 'NO ACTION',
        nullable: false,
    })
    @JoinColumn({ name: 'contractRoomId' })
    contractRoom: ContractRoom;
}
