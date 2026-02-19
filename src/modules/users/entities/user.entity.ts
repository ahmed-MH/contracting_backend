import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToMany, JoinTable, DeleteDateColumn } from 'typeorm';
import { Exclude } from 'class-transformer';
import { UserRole } from '../../../common/constants/enums';
import { AuditLog } from './audit-log.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    email: string;

    @Column({ nullable: true })
    firstName: string;

    @Column({ nullable: true })
    lastName: string;

    @Exclude()
    @Column({ nullable: true })
    password: string;

    @Column({
        type: 'simple-enum',
        enum: UserRole,
    })
    role: UserRole;

    @Column({ default: false })
    isActive: boolean;

    @Exclude()
    @Column({ nullable: true })
    invitationToken: string;

    @Exclude()
    @Column({ nullable: true })
    resetPasswordToken: string;

    @OneToMany(() => AuditLog, (log) => log.user)
    logs: AuditLog[];

    @ManyToMany(() => Hotel, (hotel) => hotel.users, { eager: false })
    @JoinTable({ name: 'user_hotels' })
    hotels: Hotel[];

    @DeleteDateColumn()
    deletedAt?: Date;
}
