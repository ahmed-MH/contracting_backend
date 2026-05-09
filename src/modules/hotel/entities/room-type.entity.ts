import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique, DeleteDateColumn } from 'typeorm';
import { Hotel } from './hotel.entity';
import { AuditableEntity } from '../../../common/audit/auditable.entity';
import { RoomInventoryType } from '../../../common/constants/enums';

@Entity()
@Unique('UQ_ROOM_CODE_HOTEL', ['code', 'hotelId'])
export class RoomType extends AuditableEntity {
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

    @Column({
        type: 'simple-enum',
        enum: RoomInventoryType,
        default: RoomInventoryType.STANDARD,
    })
    inventoryType: RoomInventoryType;

    @Column()
    minOccupancy: number;

    @Column()
    maxOccupancy: number;

    @Column()
    minAdults: number;

    @Column()
    maxAdults: number;

    @Column()
    minChildren: number;

    @Column()
    maxChildren: number;

    @Column({ default: false })
    allowCotOverMax: boolean;

    @DeleteDateColumn()
    deletedAt: Date;
}
