import { Entity, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { ContractCancellationRule } from './contract-cancellation-rule.entity';
import { ContractRoom } from '../../core/entities/contract-room.entity';

@Entity()
export class ContractCancellationRuleRoom {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => ContractCancellationRule, (rule) => rule.applicableRooms, { onDelete: 'CASCADE' })
    contractCancellationRule: ContractCancellationRule;

    @ManyToOne(() => ContractRoom, { onDelete: 'NO ACTION', createForeignKeyConstraints: false })
    contractRoom: ContractRoom;
}
