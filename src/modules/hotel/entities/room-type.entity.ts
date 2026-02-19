import { Entity, PrimaryGeneratedColumn, Column, Unique, DeleteDateColumn } from 'typeorm';

@Entity()
@Unique('UQ_ROOM_CODE', ['code'])
export class RoomType {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    code: string;

    @Column({ unique: true, nullable: true })
    displayId: string;

    @Column()
    name: string;

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
