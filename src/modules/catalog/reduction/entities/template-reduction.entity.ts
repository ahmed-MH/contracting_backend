import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    DeleteDateColumn,
} from 'typeorm';
import { Hotel } from '../../../hotel/entities/hotel.entity';
import {
    ReductionCalculationType,
    PaxType,
    PricingModifierApplicationType,
    ReductionSystemCode,
} from '../../../../common/constants/enums';

@Entity()
export class TemplateReduction {
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

    @ManyToOne(() => Hotel, { onDelete: 'CASCADE' })
    hotel: Hotel;

    @Column()
    hotelId: number;

    @DeleteDateColumn()
    deletedAt: Date;
}
