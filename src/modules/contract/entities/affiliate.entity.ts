import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { PaymentType } from '../../../shared/constants/enums';
import { Contract } from './contract.entity';

@Entity()
export class Affiliate {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    companyName: string;

    @Column()
    representativeName: string;

    @Column()
    representativeEmail: string;

    @Column({
        type: 'simple-enum',
        enum: PaymentType,
    })
    paymentType: PaymentType;

    @Column()
    market: string;

    @OneToMany(() => Contract, (contract) => contract.affiliate)
    contracts: Contract[];
}
