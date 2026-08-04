import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';

@Entity()
export class Tenant {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ default: true })
    isActive: boolean;

    @OneToMany(() => User, (user) => user.tenant)
    users: User[];

    @OneToMany(() => Hotel, (hotel) => hotel.tenant)
    hotels: Hotel[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
