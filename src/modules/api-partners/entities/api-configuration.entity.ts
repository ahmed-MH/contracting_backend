import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from 'typeorm';
import { ApiPartner } from './api-partner.entity';
import { AuthType } from '../../../common/constants/enums';

@Entity()
export class ApiConfiguration {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({
        type: 'simple-enum',
        enum: AuthType,
    })
    authType: AuthType;

    @Column({ nullable: true })
    allowedIps: string; // Comma separated IPs or CIDR

    @Column({ default: 60 })
    rateLimit: number; // Requests per minute

    @OneToOne(() => ApiPartner, (partner) => partner.configuration, {
        onDelete: 'CASCADE',
    })
    partner: ApiPartner;
}
