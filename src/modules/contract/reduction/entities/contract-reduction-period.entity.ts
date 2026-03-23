import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Column } from 'typeorm';
import { ContractReduction } from './contract-reduction.entity';
import { Period } from '../../core/entities/period.entity';

/**
 * Explicit junction entity for ContractReduction ↔ Period.
 * Using @ManyToOne (not @ManyToMany) gives us full control over onDelete,
 * which is required to avoid MSSQL multi-path cascade cycle errors.
 */
@Entity({ name: 'contract_reduction_periods' })
export class ContractReductionPeriod {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => ContractReduction, (cr) => cr.applicablePeriods, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({ name: 'contractReductionId' })
    contractReduction: ContractReduction;

    // NO ACTION to break potential cascade cycle
    @ManyToOne(() => Period, {
        onDelete: 'NO ACTION',
        nullable: false,
    })
    @JoinColumn({ name: 'periodId' })
    period: Period;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    overrideValue: number;
}
