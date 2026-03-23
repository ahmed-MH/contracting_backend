import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique, DeleteDateColumn } from 'typeorm';
import { Hotel } from './hotel.entity';

@Entity()
@Unique('UQ_ARRANGEMENT_CODE_HOTEL', ['code', 'hotelId'])
export class Arrangement {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Hotel, { onDelete: 'CASCADE' })
    hotel: Hotel;

    @Column()
    hotelId: number;

    @Column()
    code: string;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    reference: string;

    @Column()
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'int', default: 0 })
    level: number;

    @DeleteDateColumn()
    deletedAt: Date;
}
