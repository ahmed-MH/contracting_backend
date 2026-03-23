import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, DeleteDateColumn } from 'typeorm';
import { Hotel } from '../../../hotel/entities/hotel.entity';
import { SpoConditionType, SpoBenefitType, PricingModifierApplicationType } from '../../../../common/constants/enums';

@Entity()
export class TemplateSpo {
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

    @ManyToOne(() => Hotel, (hotel) => hotel.templateSpos, {
        onDelete: 'CASCADE',
    })
    hotel: Hotel;

    @Column()
    hotelId: number;

    @DeleteDateColumn()
    deletedAt: Date;
}
