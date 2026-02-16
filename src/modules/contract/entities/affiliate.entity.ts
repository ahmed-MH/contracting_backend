import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { PaymentType } from '../../../shared/constants/enums';
import { Contract } from './contract.entity';

@Entity()
export class Affiliate {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    companyName: string;

    @Column({ nullable: true })
    representativeName: string;

    @Column({ nullable: true })
    representativeEmail: string;

    @Column({
        type: 'simple-enum',
        enum: PaymentType,
    })
    paymentType: PaymentType;

    @Column({ nullable: true })
    market: string;

    @Column({ nullable: true })
    address: string;

    @Column({ nullable: true })
    phone: string;

    @Column({ nullable: true })
    fax: string;

    @OneToMany(() => Contract, (contract) => contract.affiliate)
    contracts: Contract[];
}
