import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import {
    AffiliateEmailSpoApplicationStep,
    AffiliateEmailSpoStackMode,
    AffiliateEmailSpoStatus,
} from '../../../../common/constants/enums';
import { AuditableEntity } from '../../../../common/audit/auditable.entity';
import { Hotel } from '../../../hotel/entities/hotel.entity';
import { Affiliate } from '../../entities/affiliate.entity';

@Entity('affiliate_email_spo')
@Index('IDX_affiliate_email_spo_hotel_affiliate', ['hotelId', 'affiliateId'])
export class AffiliateEmailSpo extends AuditableEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Hotel, (hotel) => hotel.affiliateEmailSpos, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'hotelId' })
    hotel: Hotel;

    @Column()
    hotelId: number;

    @ManyToOne(() => Affiliate, (affiliate) => affiliate.emailSpos, { onDelete: 'NO ACTION' })
    @JoinColumn({ name: 'affiliateId' })
    affiliate: Affiliate;

    @Column()
    affiliateId: number;

    @Column({ type: 'nvarchar', length: 255 })
    name: string;

    @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
    description: string | null;

    @Column({ type: 'decimal', precision: 5, scale: 2 })
    discountPercent: number;

    @Column({ type: 'date' })
    applicationFrom: Date;

    @Column({ type: 'date' })
    applicationTo: Date;

    @Column({
        type: 'simple-enum',
        enum: AffiliateEmailSpoStackMode,
        default: AffiliateEmailSpoStackMode.ROLLING,
    })
    stackMode: AffiliateEmailSpoStackMode;

    @Column({
        type: 'simple-enum',
        enum: AffiliateEmailSpoApplicationStep,
        default: AffiliateEmailSpoApplicationStep.AFTER_CONTRACT_SPO,
    })
    applicationStep: AffiliateEmailSpoApplicationStep;

    @Column({
        type: 'simple-enum',
        enum: AffiliateEmailSpoStatus,
        default: AffiliateEmailSpoStatus.ACTIVE,
    })
    status: AffiliateEmailSpoStatus;
}
