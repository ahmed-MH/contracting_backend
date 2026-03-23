import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
} from 'typeorm';
import { Contract } from '../../core/entities/contract.entity';
import { ContractReductionRoom } from './contract-reduction-room.entity';
import { ContractReductionPeriod } from './contract-reduction-period.entity';
import {
    ReductionCalculationType,
    PaxType,
    PricingModifierApplicationType,
    ReductionSystemCode,
} from '../../../../common/constants/enums';

@Entity()
export class ContractReduction {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    reference: string;

    @Column()
    name: string;

    @Column({
        type: 'simple-enum',
        enum: ReductionSystemCode,
        default: ReductionSystemCode.CUSTOM,
    })
    systemCode: ReductionSystemCode;

    @Column({
        type: 'simple-enum',
        enum: ReductionCalculationType,
        default: ReductionCalculationType.PERCENTAGE,
    })
    calculationType: ReductionCalculationType;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    value: number;

    @Column({
        type: 'simple-enum',
        enum: PaxType,
    })
    paxType: PaxType;

    @Column({ type: 'int', nullable: true })
    paxOrder: number | null;

    @Column({ type: 'int' })
    minAge: number;

    @Column({ type: 'int' })
    maxAge: number;

    @Column({
        type: 'simple-enum',
        enum: PricingModifierApplicationType,
        default: PricingModifierApplicationType.PER_NIGHT_PER_PERSON,
    })
    applicationType: PricingModifierApplicationType;

    @ManyToOne(() => Contract, (contract) => contract.reductions, {
        onDelete: 'CASCADE',
    })
    contract: Contract;

    // Targeting: which rooms this reduction applies to (empty = all)
    @OneToMany(() => ContractReductionRoom, (crr) => crr.contractReduction, {
        cascade: true,
        eager: false,
    })
    applicableContractRooms: ContractReductionRoom[];

    // Targeting: which periods this reduction applies to (empty = all)
    @OneToMany(() => ContractReductionPeriod, (crp) => crp.contractReduction, {
        cascade: true,
        eager: false,
    })
    applicablePeriods: ContractReductionPeriod[];

    // Audit trail: which template was this cloned from (non-FK, informational)
    @Column({ nullable: true })
    templateId: number;
}
