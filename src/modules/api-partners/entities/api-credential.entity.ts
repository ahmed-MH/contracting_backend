import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from 'typeorm';
import { ApiPartner } from './api-partner.entity';

@Entity()
export class ApiCredential {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    clientId: string;

    @Column()
    clientSecret: string; // Hashed

    @Column({ nullable: true, unique: true })
    apiKey: string; // Hashed if possible or encrypted

    @OneToOne(() => ApiPartner, (partner) => partner.credential, {
        onDelete: 'CASCADE',
    })
    partner: ApiPartner;
}
