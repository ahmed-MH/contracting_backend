import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Hotel } from './hotel.entity';

@Entity()
export class ExchangeRate {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Hotel, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'hotelId' })
    hotel: Hotel;

    @Column()
    hotelId: number;

    @Column({ length: 3 })
    currency: string;

    @Column('decimal', { precision: 10, scale: 4 })
    rate: number;

    @Column({ type: 'date' })
    validFrom: Date;

    @Column({ type: 'date', nullable: true })
    validUntil: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
