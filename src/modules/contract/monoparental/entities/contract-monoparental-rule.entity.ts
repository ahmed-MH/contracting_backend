import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
} from 'typeorm';
import { Contract } from '../../core/entities/contract.entity';
import { ContractMonoparentalRuleRoom } from './contract-monoparental-rule-room.entity';
import { ContractMonoparentalRulePeriod } from './contract-monoparental-rule-period.entity';
import { BaseRateType, ChildSurchargeBase } from '../../../../common/constants/enums';

@Entity()
export class ContractMonoparentalRule {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    reference: string;

    @Column()
    name: string;

    // ─── Zone A: Condition (Trigger) ─────────────────────────────────
    @Column({ type: 'int' })
    adultCount: number;

    @Column({ type: 'int' })
    childCount: number;

    @Column({ type: 'decimal', precision: 5, scale: 2 })
    minAge: number;

    @Column({ type: 'decimal', precision: 5, scale: 2 })
    maxAge: number;

    // ─── Zone B: Pricing Formula ─────────────────────────────────────
    @Column({
        type: 'simple-enum',
        enum: BaseRateType,
        default: BaseRateType.SINGLE,
    })
    baseRateType: BaseRateType;

    @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
    childSurchargePercentage: number;

    @Column({
        type: 'simple-enum',
        enum: ChildSurchargeBase,
        default: ChildSurchargeBase.HALF_DOUBLE,
    })
    childSurchargeBase: ChildSurchargeBase;

    // ─── Relations ───────────────────────────────────────────────────
    @ManyToOne(() => Contract, (contract) => contract.monoparentalRules, {
        onDelete: 'CASCADE',
    })
    contract: Contract;

    // Targeting: which rooms this rule applies to (empty = all)
    @OneToMany(() => ContractMonoparentalRuleRoom, (j) => j.contractMonoparentalRule, {
        cascade: true,
        eager: false,
    })
    applicableContractRooms: ContractMonoparentalRuleRoom[];

    // Targeting: which periods this rule applies to (empty = all)
    @OneToMany(() => ContractMonoparentalRulePeriod, (j) => j.contractMonoparentalRule, {
        cascade: true,
        eager: false,
    })
    applicablePeriods: ContractMonoparentalRulePeriod[];

    // Audit trail: which template was this cloned from (non-FK, informational)
    @Column({ nullable: true })
    templateId: number;
}
