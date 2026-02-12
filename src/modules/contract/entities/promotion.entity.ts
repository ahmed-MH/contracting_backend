import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ContractLine } from './contract-line.entity';

@Entity()
export class Promotion {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    discountValue: number;

    @Column({ nullable: true })
    condition: string;

    @ManyToOne(() => ContractLine, (line) => line.promotions, {
        onDelete: 'CASCADE',
    })
    contractLine: ContractLine;
}
