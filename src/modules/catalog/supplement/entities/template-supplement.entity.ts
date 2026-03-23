import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    DeleteDateColumn,
} from 'typeorm';
import { Hotel } from '../../../hotel/entities/hotel.entity';
import {
    SupplementCalculationType,
    PricingModifierApplicationType,
    SupplementSystemCode,
} from '../../../../common/constants/enums';

@Entity()
export class TemplateSupplement {
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

    /**
     * Optional specific event date (YYYY-MM-DD).
     * When set, this supplement is only available for contracts that cover this date.
     * Example: "2026-02-14" for Valentine's Day dinner.
     */
    @Column({ type: 'varchar', length: 10, nullable: true, default: null })
    specificDate: string | null;

    @ManyToOne(() => Hotel, { onDelete: 'CASCADE' })
    hotel: Hotel;

    @DeleteDateColumn()
    deletedAt: Date;
}
