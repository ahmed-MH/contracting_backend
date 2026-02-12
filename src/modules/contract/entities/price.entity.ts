import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    Unique,
} from 'typeorm';
import { ContractLine } from './contract-line.entity';
import { Arrangement } from '../../hotel/entities/arrangement.entity';

@Entity()
@Unique(['contractLine', 'arrangement'])
export class Price {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    amount: number;

    @Column()
    currency: string;

    @Column()
    minStay: number;

    @Column()
    releaseDays: number;

    @ManyToOne(() => ContractLine, (line) => line.prices, {
        onDelete: 'CASCADE',
    })
    contractLine: ContractLine;

    @ManyToOne(() => Arrangement)
    arrangement: Arrangement;
}
