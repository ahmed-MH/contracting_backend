import { IntegrationApiKeyEnvironment, IntegrationUsageLogSource } from '../../../common/constants/enums';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { IntegrationApiKey } from './integration-api-key.entity';
import { IntegrationApiUser } from './integration-api-user.entity';

@Entity('integration_api_usage_log')
export class IntegrationApiUsageLog {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int', nullable: true })
    tenantId: number | null;

    @Column({ length: 100 })
    endpointCode: string;

    @Column({
        type: 'varchar',
        length: 20,
        default: IntegrationUsageLogSource.PUBLIC_API,
    })
    source: IntegrationUsageLogSource;

    @ManyToOne(() => IntegrationApiUser, (apiUser) => apiUser.usageLogs, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'apiUserId' })
    apiUser: IntegrationApiUser | null;

    @Column({ type: 'int', nullable: true })
    apiUserId: number | null;

    @ManyToOne(() => IntegrationApiKey, (apiKey) => apiKey.usageLogs, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'apiKeyId' })
    apiKey: IntegrationApiKey | null;

    @Column({ type: 'int', nullable: true })
    apiKeyId: number | null;

    @Column({
        type: 'varchar',
        length: 20,
        nullable: true,
    })
    apiKeyEnvironment: IntegrationApiKeyEnvironment | null;

    @ManyToOne(() => Hotel, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'hotelId' })
    hotel: Hotel | null;

    @Column({ type: 'int', nullable: true })
    hotelId: number | null;

    @Column({ type: 'nvarchar', length: 100, nullable: true })
    requestId: string | null;

    @Column({ type: 'nvarchar', length: 100, nullable: true })
    externalReservationCode: string | null;

    @Column({ type: 'int' })
    statusCode: number;

    @Column({ default: false })
    success: boolean;

    @Column({ type: 'nvarchar', length: 100, nullable: true })
    errorCode: string | null;

    @Column({ type: 'nvarchar', length: 2000, nullable: true })
    errorMessage: string | null;

    @Column({ type: 'int' })
    durationMs: number;

    @Column({ type: 'nvarchar', length: 255, nullable: true })
    ipAddress: string | null;

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
        transformer: {
            to: (value: unknown) => (value == null ? null : JSON.stringify(value)),
            from: (value: string | null) => (value ? JSON.parse(value) : null),
        },
    })
    requestJson: Record<string, unknown> | null;

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
        transformer: {
            to: (value: unknown) => (value == null ? null : JSON.stringify(value)),
            from: (value: string | null) => (value ? JSON.parse(value) : null),
        },
    })
    responseJson: Record<string, unknown> | null;

    @Column({
        type: 'datetime2',
        default: () => 'SYSUTCDATETIME()',
    })
    createdAt: Date;
}
