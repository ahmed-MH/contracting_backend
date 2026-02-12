import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class RoomType {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
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
