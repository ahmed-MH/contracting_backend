import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ContractCancellationRule } from './contract-cancellation-rule.entity';
import { Period } from '../../core/entities/period.entity';

@Entity({ name: 'contract_cancellation_rule_periods' })
export class ContractCancellationRulePeriod {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => ContractCancellationRule, (rule) => rule.applicablePeriods, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({ name: 'contractCancellationRuleId' })
    contractCancellationRule: ContractCancellationRule;

    @ManyToOne(() => Period, { onDelete: 'NO ACTION', nullable: false })
    @JoinColumn({ name: 'periodId' })
    period: Period;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    overrideValue: number | null;
}
