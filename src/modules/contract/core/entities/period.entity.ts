import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Contract } from './contract.entity';

@Entity()
export class Period {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ type: 'date' })
    startDate: Date;

    @Column({ type: 'date' })
    endDate: Date;

    @ManyToOne(() => Contract, (contract) => contract.periods, {
        onDelete: 'CASCADE',
    })
    contract: Contract;
}
