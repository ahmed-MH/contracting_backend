import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
} from 'typeorm';
import { Contract } from '../../core/entities/contract.entity';
import { ContractSupplementRoom } from './contract-supplement-room.entity';
import { ContractSupplementPeriod } from './contract-supplement-period.entity';
import {
    SupplementCalculationType,
    PricingModifierApplicationType,
    SupplementSystemCode,
} from '../../../../common/constants/enums';

@Entity()
export class ContractSupplement {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    reference: string;

    @Column()
    name: string;

    @Column({
        type: 'simple-enum',
        enum: SupplementSystemCode,
        default: SupplementSystemCode.CUSTOM,
    })
    systemCode: SupplementSystemCode;

    @Column({
        type: 'simple-enum',
        enum: SupplementCalculationType,
        default: SupplementCalculationType.FIXED,
    })
    type: SupplementCalculationType;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    value: number;

    @Column({ nullable: true })
    formula: string;

    @Column({ default: false })
    isMandatory: boolean;

    @Column({
        type: 'simple-enum',
        enum: PricingModifierApplicationType,
        default: PricingModifierApplicationType.PER_NIGHT_PER_ROOM,
    })
    applicationType: PricingModifierApplicationType;

    @Column({ type: 'int', nullable: true })
    minAge: number | null;

    @Column({ type: 'int', nullable: true })
    maxAge: number | null;

    @ManyToOne(() => Contract, (contract) => contract.supplements, {
        onDelete: 'CASCADE',
    })
    contract: Contract;

    // Targeting: which rooms this supplement applies to (empty = all)
    @OneToMany(() => ContractSupplementRoom, (csr) => csr.contractSupplement, {
        cascade: true,
        eager: false,
    })
    applicableContractRooms: ContractSupplementRoom[];

    // Targeting: which periods this supplement applies to (empty = all)
    @OneToMany(() => ContractSupplementPeriod, (csp) => csp.contractSupplement, {
        cascade: true,
        eager: false,
    })
    applicablePeriods: ContractSupplementPeriod[];

    // Audit trail: which template was this cloned from (non-FK, informational)
    @Column({ nullable: true })
    templateId: number;

    /**
     * Specific event date inherited from the template (YYYY-MM-DD).
     * When set, this supplement was auto-assigned to the matching period.
     */
    @Column({ type: 'varchar', length: 10, nullable: true, default: null })
    specificDate: string | null;
}
