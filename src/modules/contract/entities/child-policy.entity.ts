import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ContractLine } from './contract-line.entity';
import { DiscountType } from '../../../common/constants/enums';

@Entity()
export class ChildPolicy {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'decimal', precision: 4, scale: 2 })
    minAge: number;

    @Column({ type: 'decimal', precision: 4, scale: 2 })
    maxAge: number;

    @Column({
        type: 'simple-enum',
        enum: DiscountType,
        default: DiscountType.PERCENTAGE,
    })
    discountType: DiscountType;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    discountValue: number;

    @ManyToOne(() => ContractLine, (line) => line.childPolicies, {
        onDelete: 'CASCADE',
    })
    contractLine: ContractLine;
}
