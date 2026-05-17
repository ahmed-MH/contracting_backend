import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuditLogCategory, AuditLogSeverity } from './audit.types';

@Entity('system_audit_log')
export class SystemLog {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'varchar', length: 100 })
    eventType: string;

    @Index()
    @Column({ type: 'varchar', length: 40 })
    category: AuditLogCategory;

    @Index()
    @Column({ type: 'varchar', length: 20, default: AuditLogSeverity.INFO })
    severity: AuditLogSeverity;

    @Column({ type: 'nvarchar', length: 1000 })
    message: string;

    @Index()
    @Column({ type: 'int', nullable: true })
    actorUserId: number | null;

    @Column({ type: 'nvarchar', length: 255, nullable: true })
    actorEmail: string | null;

    @Column({ type: 'varchar', length: 50, nullable: true })
    actorRole: string | null;

    @Index()
    @Column({ type: 'int', nullable: true })
    tenantId: number | null;

    @Column({ type: 'nvarchar', length: 255, nullable: true })
    tenantName: string | null;

    @Column({ type: 'nvarchar', length: 100, nullable: true })
    targetType: string | null;

    @Column({ type: 'nvarchar', length: 100, nullable: true })
    targetId: string | null;

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
        transformer: {
            to: (value: Record<string, unknown> | null) => value ? JSON.stringify(value) : null,
            from: (value: string | null): Record<string, unknown> | null => {
                if (!value) return null;
                try {
                    return JSON.parse(value) as Record<string, unknown>;
                } catch {
                    return null;
                }
            },
        },
    })
    metadata: Record<string, unknown> | null;

    @Column({ type: 'nvarchar', length: 100, nullable: true })
    ipAddress: string | null;

    @Column({ type: 'nvarchar', length: 500, nullable: true })
    userAgent: string | null;

    @Index()
    @CreateDateColumn({ type: 'datetime2' })
    createdAt: Date;
}
