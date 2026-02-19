import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, DeleteDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity()
export class Hotel {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ nullable: true })
    logoUrl: string;

    @Column()
    address: string;

    @Column()
    phone: string;

    @Column()
    legalRepresentative: string;

    @Column()
    bankDetails: string;

    @Column()
    defaultCurrency: string;

    @ManyToMany(() => User, (user) => user.hotels)
    users: User[];

    @DeleteDateColumn()
    deletedAt: Date;
}
