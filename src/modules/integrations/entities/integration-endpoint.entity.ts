import { AuditableEntity } from '../../../common/audit/auditable.entity';
import { IntegrationEndpointStatus } from '../../../common/constants/enums';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

const jsonTransformer = {
    to: (value: unknown) => (value == null ? null : JSON.stringify(value)),
    from: (value: string | null) => (value ? JSON.parse(value) : null),
};

@Entity('integration_endpoint')
@Index('IDX_integration_endpoint_code_tenant', ['code', 'tenantId'], { unique: true })
export class IntegrationEndpoint extends AuditableEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int', nullable: true })
    tenantId: number | null;

    @Column({ length: 100 })
    code: string;

    @Column({ length: 16 })
    method: string;

    @Column({ length: 255 })
    path: string;

    @Column({ length: 32 })
    version: string;

    @Column({
        type: 'varchar',
        length: 20,
        default: IntegrationEndpointStatus.ACTIVE,
    })
    status: IntegrationEndpointStatus;

    @Column({ default: true })
    requiresApiKey: boolean;

    @Column({ default: 60 })
    rateLimitPerMinute: number;

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
        transformer: jsonTransformer,
    })
    requestSchemaJson: Record<string, unknown> | null;

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
        transformer: jsonTransformer,
    })
    responseSchemaJson: Record<string, unknown> | null;
}
