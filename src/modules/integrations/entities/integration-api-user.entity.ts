import { AuditableEntity } from '../../../common/audit/auditable.entity';
import {
    IntegrationApiUserStatus,
    IntegrationPermission,
} from '../../../common/constants/enums';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { IntegrationApiKey } from './integration-api-key.entity';
import { IntegrationApiUsageLog } from './integration-api-usage-log.entity';
import {
    Column,
    Entity,
    JoinTable,
    ManyToMany,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('integration_api_user')
export class IntegrationApiUser extends AuditableEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 255 })
    name: string;

    @Column({ type: 'nvarchar', length: 1000, nullable: true })
    description: string | null;

    @Column({
        type: 'varchar',
        length: 20,
        default: IntegrationApiUserStatus.ACTIVE,
    })
    status: IntegrationApiUserStatus;

    @Column({ type: 'int', nullable: true })
    tenantId: number | null;

    @Column({
        type: 'simple-array',
        nullable: true,
    })
    permissions: IntegrationPermission[];

    @ManyToMany(() => Hotel)
    @JoinTable({
        name: 'integration_api_user_allowed_hotel',
        joinColumn: { name: 'integrationApiUserId', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'hotelId', referencedColumnName: 'id' },
    })
    allowedHotels: Hotel[];

    @OneToMany(() => IntegrationApiKey, (apiKey) => apiKey.apiUser)
    apiKeys: IntegrationApiKey[];

    @OneToMany(() => IntegrationApiUsageLog, (usageLog) => usageLog.apiUser)
    usageLogs: IntegrationApiUsageLog[];
}
