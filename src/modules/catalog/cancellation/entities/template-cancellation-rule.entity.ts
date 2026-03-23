import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, DeleteDateColumn } from 'typeorm';
import { Hotel } from '../../../hotel/entities/hotel.entity';
import { CancellationPenaltyType } from '../../../../common/constants/enums';

@Entity()
export class TemplateCancellationRule {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    reference: string;

    @Column()
    name: string;

    @Column({ type: 'int' })
    daysBeforeArrival: number;

    @Column({ type: 'bit', default: false })
    appliesToNoShow: boolean;

    @Column({ type: 'int', nullable: true })
    minStayCondition: number;

    @Column({
        type: 'varchar',
        length: 20,
    })
    penaltyType: CancellationPenaltyType;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    baseValue: number;

    @ManyToOne(() => Hotel, { onDelete: 'CASCADE' })
    hotel: Hotel;

    @Column()
    hotelId: number;

    @DeleteDateColumn()
    deletedAt: Date;
}
