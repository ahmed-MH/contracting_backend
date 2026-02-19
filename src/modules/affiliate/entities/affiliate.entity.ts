import { Entity, PrimaryGeneratedColumn, Column, OneToMany, DeleteDateColumn } from 'typeorm';
import { PaymentType } from '../../../common/constants/enums';
import { Contract } from '../../contract/entities/contract.entity';

@Entity()
export class Affiliate {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    companyName: string;

    @Column({ unique: true, nullable: true })
    displayId: string;

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

    @DeleteDateColumn()
    deletedAt: Date;
}
