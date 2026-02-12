import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { UserRole } from '../../../shared/constants/enums';
import { AuditLog } from './audit-log.entity';

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
}
