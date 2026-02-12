import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Arrangement {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    code: string;

    @Column()
    name: string;
}
