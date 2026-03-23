import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Contract } from '../../core/entities/contract.entity';
import { TemplateSpo } from '../../../catalog/spo/entities/template-spo.entity';
import { ContractSpoPeriod } from './contract-spo-period.entity';
import { ContractSpoRoom } from './contract-spo-room.entity';
import { ContractSpoArrangement } from './contract-spo-arrangement.entity';
import { SpoConditionType, SpoBenefitType, PricingModifierApplicationType } from '../../../../common/constants/enums';

@Entity()
export class ContractSpo {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    reference: string;

    @Column()
    name: string;

    @Column({
        type: 'simple-enum',
        enum: SpoConditionType,
        default: SpoConditionType.NONE,
    })
    conditionType: SpoConditionType;

    @Column({ type: 'int', nullable: true })
    conditionValue: number;

    @Column({
        type: 'simple-enum',
        enum: SpoBenefitType,
    })
    benefitType: SpoBenefitType;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    benefitValue: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    value: number;

    @Column({
        type: 'simple-enum',
        enum: PricingModifierApplicationType,
        default: PricingModifierApplicationType.PER_NIGHT_PER_ROOM,
    })
    applicationType: PricingModifierApplicationType;

    @Column({ type: 'int', default: 0 })
    stayNights: number;

    @Column({ type: 'int', default: 0 })
    payNights: number;

    @ManyToOne(() => Contract, (contract) => contract.contractSpos, {
        onDelete: 'CASCADE',
    })
    contract: Contract;

    @Column()
    contractId: number;

    @ManyToOne(() => TemplateSpo, { nullable: true, createForeignKeyConstraints: false })
    templateSpo: TemplateSpo;

    @Column({ nullable: true })
    templateSpoId: number;

    // ─── Targeting (Ciblage) ──────────────────────────────────────────

    @OneToMany(() => ContractSpoPeriod, (csp) => csp.contractSpo, { cascade: true, eager: false })
    applicablePeriods: ContractSpoPeriod[];

    @OneToMany(() => ContractSpoRoom, (csr) => csr.contractSpo, { cascade: true, eager: false })
    applicableContractRooms: ContractSpoRoom[];

    @OneToMany(() => ContractSpoArrangement, (csa) => csa.contractSpo, { cascade: true, eager: false })
    applicableArrangements: ContractSpoArrangement[];
}
