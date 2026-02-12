import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Hotel {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ nullable: true })
    logoUrl: string;

    @Column()
    address: string;

    @Column()
    phone: string;

    @Column()
    legalRepresentative: string;

    @Column()
    bankDetails: string;

    @Column()
    defaultCurrency: string;
}
