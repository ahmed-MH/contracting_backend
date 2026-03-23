import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Column } from 'typeorm';
import { ContractSupplement } from './contract-supplement.entity';
import { Period } from '../../core/entities/period.entity';

/**
 * Explicit junction entity for ContractSupplement ↔ Period.
 * Using @ManyToOne (not @ManyToMany) gives us full control over onDelete,
 * which is required to avoid MSSQL multi-path cascade cycle errors.
 */
@Entity({ name: 'contract_supplement_periods' })
export class ContractSupplementPeriod {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => ContractSupplement, (cs) => cs.applicablePeriods, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({ name: 'contractSupplementId' })
    contractSupplement: ContractSupplement;

    // NO ACTION to break potential cascade cycle:
    // Contract──CASCADE──►Period and
    // Contract──CASCADE──►ContractSupplement──►contract_supplement_periods──►Period
    @ManyToOne(() => Period, {
        onDelete: 'NO ACTION',
        nullable: false,
    })
    @JoinColumn({ name: 'periodId' })
    period: Period;

    /**
     * Seasonal override: if set, this value replaces the parent supplement's
     * base `value` for this specific period. Null = inherit base value.
     */
    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, default: null })
    overrideValue: number | null;
}
