import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';

@Entity()
@Unique('UQ_ROOM_CODE', ['code'])
export class RoomType {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    code: string;

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
}
