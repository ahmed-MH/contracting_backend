import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from 'typeorm';
import { ContractLine } from './contract-line.entity';

@Entity()
export class Allotment {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    quantity: number;

    @Column({ default: false })
    isStopSale: boolean;

    @OneToOne(() => ContractLine, (line) => line.allotment, {
        onDelete: 'CASCADE',
    })
    contractLine: ContractLine;
}
