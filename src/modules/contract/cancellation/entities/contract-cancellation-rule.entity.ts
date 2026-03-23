import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Contract } from '../../core/entities/contract.entity';
import { TemplateCancellationRule } from '../../../catalog/cancellation/entities/template-cancellation-rule.entity';
import { ContractCancellationRulePeriod } from './contract-cancellation-rule-period.entity';
import { ContractCancellationRuleRoom } from './contract-cancellation-rule-room.entity';
import { CancellationPenaltyType } from '../../../../common/constants/enums';

@Entity()
export class ContractCancellationRule {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, nullable: true })
    reference: string;

    @Column()
    name: string;

    @Column({ type: 'int' })
    daysBeforeArrival: number;

    @Column({ type: 'bit', default: false })
    appliesToNoShow: boolean;

    @Column({ type: 'int', nullable: true })
    minStayCondition: number;

    @Column({
        type: 'varchar',
        length: 20,
    })
    penaltyType: CancellationPenaltyType;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    baseValue: number;

    @ManyToOne(() => Contract, (contract) => contract.cancellationRules, { onDelete: 'CASCADE' })
    contract: Contract;

    @Column()
    contractId: number;

    @ManyToOne(() => TemplateCancellationRule, { nullable: true, createForeignKeyConstraints: false })
    templateCancellationRule: TemplateCancellationRule;

    @Column({ nullable: true })
    templateCancellationRuleId: number;

    @OneToMany(() => ContractCancellationRulePeriod, (period) => period.contractCancellationRule, { cascade: true })
    applicablePeriods: ContractCancellationRulePeriod[];

    @OneToMany(() => ContractCancellationRuleRoom, (room) => room.contractCancellationRule, { cascade: true })
    applicableRooms: ContractCancellationRuleRoom[];
}
