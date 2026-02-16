import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToMany, JoinTable } from 'typeorm';
import { UserRole } from '../../../shared/constants/enums';
import { AuditLog } from './audit-log.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    email: string;

    @Column()
    firstName: string;

    @Column()
    lastName: string;

    @Column()
    password: string;

    @Column({
        type: 'simple-enum',
        enum: UserRole,
    })
    role: UserRole;

    @Column({ default: true })
    isActive: boolean;

    @OneToMany(() => AuditLog, (log) => log.user)
    logs: AuditLog[];

    @ManyToMany(() => Hotel, (hotel) => hotel.users, { eager: false })
    @JoinTable({ name: 'user_hotels' })
    hotels: Hotel[];
}
