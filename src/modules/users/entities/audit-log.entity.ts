import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity()
export class AuditLog {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    action: string;

    @Column()
    entityName: string;

    @Column()
    entityId: string;

    @Column({ type: 'text', nullable: true })
    oldValue: string;

    @Column({ type: 'text', nullable: true })
    newValue: string;

    @Column({ nullable: true })
    ipAddress: string;

    @CreateDateColumn()
    timestamp: Date;

    @Column({ default: 'SUCCESS' })
    status: string;

    @ManyToOne(() => User, (user) => user.logs)
    user: User;
}
