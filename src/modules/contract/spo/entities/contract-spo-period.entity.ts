import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ContractSpo } from './contract-spo.entity';
import { Period } from '../../core/entities/period.entity';

@Entity({ name: 'contract_spo_periods' })
export class ContractSpoPeriod {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => ContractSpo, (spo) => spo.applicablePeriods, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({ name: 'contractSpoId' })
    contractSpo: ContractSpo;

    @ManyToOne(() => Period, { onDelete: 'NO ACTION', nullable: false })
    @JoinColumn({ name: 'periodId' })
    period: Period;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    overrideValue: number | null;
}
