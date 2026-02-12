import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ContractLine } from './contract-line.entity';
import { SupplementType, SupplementValueType } from '../../../shared/constants/enums';

@Entity()
export class Supplement {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({
        type: 'simple-enum',
        enum: SupplementValueType,
        default: SupplementValueType.AMOUNT,
    })
    valueType: SupplementValueType;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    value: number;

    @Column({ nullable: true })
    formula: string;

    @Column({
        type: 'simple-enum',
        enum: SupplementType,
    })
    type: SupplementType;

    @Column({ default: false })
    isMandatory: boolean;

    @ManyToOne(() => ContractLine, (line) => line.supplements, {
        onDelete: 'CASCADE',
    })
    contractLine: ContractLine;
}
