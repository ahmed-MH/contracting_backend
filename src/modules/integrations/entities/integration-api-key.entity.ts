import { Exclude } from 'class-transformer';
import { AuditableEntity } from '../../../common/audit/auditable.entity';
import { IntegrationApiKeyEnvironment, IntegrationApiKeyStatus } from '../../../common/constants/enums';
import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    OneToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { IntegrationApiUser } from './integration-api-user.entity';
import { IntegrationApiUsageLog } from './integration-api-usage-log.entity';

@Entity('integration_api_key')
@Index('IDX_integration_api_key_prefix', ['prefix'], { unique: true })
export class IntegrationApiKey extends AuditableEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 255 })
    name: string;

    @Column({ length: 64 })
    prefix: string;

    @Exclude()
    @Column({ type: 'varchar', length: 255, select: false })
    hashedSecret: string;

    @ManyToOne(() => IntegrationApiUser, (apiUser) => apiUser.apiKeys, {
        onDelete: 'NO ACTION',
    })
    @JoinColumn({ name: 'apiUserId' })
    apiUser: IntegrationApiUser;

    @Column()
    apiUserId: number;

    @Column({
        type: 'varchar',
        length: 20,
        default: IntegrationApiKeyStatus.ACTIVE,
    })
    status: IntegrationApiKeyStatus;

    @Column({
        type: 'varchar',
        length: 20,
        default: IntegrationApiKeyEnvironment.TEST,
    })
    environment: IntegrationApiKeyEnvironment;

    @Column({ type: 'datetime2', nullable: true })
    expiresAt: Date | null;

    @Column({ type: 'datetime2', nullable: true })
    lastUsedAt: Date | null;

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
        transformer: {
            to: (value: string[] | null) => (value == null ? null : JSON.stringify(value)),
            from: (value: string | null) => (value ? JSON.parse(value) : []),
        },
    })
    allowedIps: string[] | null;

    @Column({ type: 'int', nullable: true })
    rotatedFromKeyId: number | null;

    @OneToOne(() => IntegrationApiKey, { nullable: true, onDelete: 'NO ACTION' })
    @JoinColumn({ name: 'rotatedFromKeyId' })
    rotatedFrom: IntegrationApiKey | null;

    @Column({ type: 'int', nullable: true })
    rotatedToKeyId: number | null;

    @OneToOne(() => IntegrationApiKey, { nullable: true, onDelete: 'NO ACTION' })
    @JoinColumn({ name: 'rotatedToKeyId' })
    rotatedTo: IntegrationApiKey | null;

    @OneToMany(() => IntegrationApiUsageLog, (usageLog) => usageLog.apiKey)
    usageLogs: IntegrationApiUsageLog[];
}
