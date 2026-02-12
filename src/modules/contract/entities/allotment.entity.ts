import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ContractLine } from './contract-line.entity';

@Entity()
export class Allotment {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    quantity: number;

    @ManyToOne(() => ContractLine, (line) => line.allotments, {
        onDelete: 'CASCADE',
    })
    contractLine: ContractLine;
}
