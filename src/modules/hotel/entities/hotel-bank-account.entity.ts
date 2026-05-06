import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditableEntity } from '../../../common/audit/auditable.entity';
import { Hotel } from './hotel.entity';

@Entity()
@Index('IDX_HOTEL_BANK_ACCOUNT_HOTEL_ACTIVE', ['hotelId', 'active'])
@Index('UQ_HOTEL_BANK_ACCOUNT_PRINCIPAL', ['hotelId'], { unique: true, where: '[isDefault] = 1' })
export class HotelBankAccount extends AuditableEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Hotel, (hotel) => hotel.bankAccounts, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'hotelId' })
    hotel: Hotel;

    @Column()
    hotelId: number;

    @Column()
    label: string;

    @Column({ nullable: true })
    bankName: string;

    @Column({ nullable: true })
    accountNumber: string;

    @Column({ nullable: true })
    rib: string;

    @Column({ nullable: true })
    iban: string;

    @Column({ nullable: true })
    swiftCode: string;

    @Column({ type: 'varchar', length: 3, nullable: true })
    currency: string;

    @Column({ type: 'varchar', length: 2, nullable: true })
    country: string;

    @Column({ default: false })
    isDefault: boolean;

    @Column({ default: true })
    active: boolean;
}
