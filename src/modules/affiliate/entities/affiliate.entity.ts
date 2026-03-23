import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, DeleteDateColumn } from 'typeorm';
import { AffiliateType } from '../../../common/constants/enums';
import { Contract } from '../../contract/core/entities/contract.entity';

export interface AffiliateEmail {
    label: string;
    address: string;
}

@Entity()
export class Affiliate {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    hotelId: number;

    @Column()
    companyName: string;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    reference: string;

    @Column({ nullable: true })
    representativeName: string;

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
        transformer: {
            to: (value: AffiliateEmail[]) => (value ? JSON.stringify(value) : null),
            from: (value: string): AffiliateEmail[] => (value ? (JSON.parse(value) as AffiliateEmail[]) : []),
        },
    })
    emails: AffiliateEmail[];

    @Column({
        type: 'simple-enum',
        enum: AffiliateType,
        default: AffiliateType.TOUR_OPERATOR,
    })
    affiliateType: AffiliateType;

    @Column({ nullable: true })
    bankName: string;

    @Column({ nullable: true })
    iban: string;

    @Column({ nullable: true })
    swift: string;

    @Column({ nullable: true })
    address: string;

    @Column({ nullable: true })
    phone: string;

    @Column({ nullable: true })
    fax: string;

    @ManyToMany(() => Contract, (contract) => contract.affiliates)
    contracts: Contract[];

    @DeleteDateColumn()
    deletedAt: Date;
}
