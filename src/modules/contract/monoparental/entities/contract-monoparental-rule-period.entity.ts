import { Entity, PrimaryGeneratedColumn, ManyToOne, Column, JoinColumn } from 'typeorm';
import { ContractMonoparentalRule } from './contract-monoparental-rule.entity';
import { Period } from '../../core/entities/period.entity';

@Entity({ name: 'contract_monoparental_rule_periods' })
export class ContractMonoparentalRulePeriod {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => ContractMonoparentalRule, (r) => r.applicablePeriods, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({ name: 'contractMonoparentalRuleId' })
    contractMonoparentalRule: ContractMonoparentalRule;

    // NO ACTION to avoid MSSQL cascade cycle
    @ManyToOne(() => Period, {
        onDelete: 'NO ACTION',
        nullable: false,
    })
    @JoinColumn({ name: 'periodId' })
    period: Period;

    @Column({ type: 'varchar', length: 50, nullable: true })
    overrideBaseRateType: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    overrideChildSurchargeBase: string;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    overrideChildSurchargeValue: number;
}
