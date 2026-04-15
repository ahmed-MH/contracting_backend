import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    Unique,
} from 'typeorm';
import { ContractLine } from './contract-line.entity';
import { Arrangement } from '../../../hotel/entities/arrangement.entity';

@Entity('contract_rates')
@Unique(['contractLine'])
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

    // Deprecated compatibility field. Base-board rates no longer vary by arrangement;
    // saved rows keep the contract base arrangement only to help migrate older data.
    @ManyToOne(() => Arrangement, { nullable: true })
    arrangement: Arrangement | null;
}
