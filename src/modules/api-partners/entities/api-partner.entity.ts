import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToOne,
    JoinColumn,
} from 'typeorm';
import { ApiConfiguration } from './api-configuration.entity';
import { ApiCredential } from './api-credential.entity';

@Entity()
export class ApiPartner {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ default: true })
    isActive: boolean;

    @OneToOne(() => ApiConfiguration, (config) => config.partner, {
        cascade: true,
        onDelete: 'CASCADE',
    })
    @JoinColumn()
    configuration: ApiConfiguration;

    @OneToOne(() => ApiCredential, (credential) => credential.partner, {
        cascade: true,
        onDelete: 'CASCADE',
    })
    @JoinColumn()
    credential: ApiCredential;
}
