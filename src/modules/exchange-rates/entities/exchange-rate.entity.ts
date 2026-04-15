import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Hotel } from '../../hotel/entities/hotel.entity';

export enum ExchangeRateSource {
    MANUAL = 'manual',
    SYSTEM = 'system',
    IMPORTED = 'imported',
}

@Entity()
@Index('IDX_exchange_rate_pair_effective', ['hotelId', 'fromCurrency', 'toCurrency', 'effectiveDate'])
export class ExchangeRate {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Hotel, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'hotelId' })
    hotel: Hotel;

    @Column()
    hotelId: number;

    @Column({ length: 3, nullable: true })
    fromCurrency: string;

    @Column({ length: 3, nullable: true })
    toCurrency: string;

    @Column('decimal', { precision: 18, scale: 8 })
    rate: number;

    @Column({ type: 'date', nullable: true })
    effectiveDate: Date;

    @Column({
        type: 'varchar',
        length: 20,
        default: ExchangeRateSource.MANUAL,
    })
    source: ExchangeRateSource;

    @Column({ nullable: true })
    updatedBy: string;

    @Column({ length: 3, nullable: true })
    currency?: string;

    @Column({ type: 'date', nullable: true })
    validFrom?: Date;

    @Column({ type: 'date', nullable: true })
    validUntil?: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
