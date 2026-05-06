import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, DeleteDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { AuditableEntity } from '../../../common/audit/auditable.entity';
import { User } from '../../users/entities/user.entity';
import { TemplateMonoparentalRule } from '../../catalog/monoparental/entities/template-monoparental-rule.entity';
import { TemplateEarlyBooking } from '../../catalog/early-booking/entities/template-early-booking.entity';
import { TemplateSpo } from '../../catalog/spo/entities/template-spo.entity';
import { TemplateCancellationRule } from '../../catalog/cancellation/entities/template-cancellation-rule.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Affiliate } from '../../affiliate/entities/affiliate.entity';
import { AffiliateEmailSpo } from '../../affiliate/email-spo/entities/affiliate-email-spo.entity';
import { HotelBankAccount } from './hotel-bank-account.entity';

export interface HotelEmail {
    label: string;   // ex: "Réservations", "Direction", "Facturation"
    address: string;
}

@Entity()
export class Hotel extends AuditableEntity {
    @PrimaryGeneratedColumn()
    id: number;

    // ── Identité de base ─────────────────────────────────────────────
    @Column()
    name: string;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    reference: string;

    @Column({ nullable: true })
    logoUrl: string;

    @Column({ type: 'varchar', length: 7, nullable: true })
    preferredThemeColor: string;

    @Column({ nullable: true })
    stars: number;

    // ── Localisation & Contact ───────────────────────────────────────
    @Column()
    address: string;

    @Column()
    phone: string;

    @Column({ nullable: true })
    fax: string;

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
        transformer: {
            to: (value: HotelEmail[]) => (value ? JSON.stringify(value) : null),
            from: (value: string): HotelEmail[] => (value ? (JSON.parse(value) as HotelEmail[]) : []),
        },
    })
    emails: HotelEmail[];

    // ── Légal ────────────────────────────────────────────────────────
    @Column()
    legalRepresentative: string;

    @Column({ nullable: true })
    fiscalName: string;

    @Column({ nullable: true })
    vatNumber: string;

    // ── Bancaire ─────────────────────────────────────────────────────
    @Column({ nullable: true })
    bankName: string;

    @Column({ nullable: true })
    accountNumber: string;

    @Column({ nullable: true })
    swiftCode: string;

    @Column({ nullable: true })
    ibanCode: string;

    @OneToMany(() => HotelBankAccount, (bankAccount) => bankAccount.hotel, {
        cascade: true,
        onDelete: 'CASCADE',
    })
    bankAccounts: HotelBankAccount[];

    // ── Opérationnel ─────────────────────────────────────────────────
    @Column()
    defaultCurrency: string;

    // ── Relations ────────────────────────────────────────────────────
    @OneToMany(() => TemplateMonoparentalRule, (rule) => rule.hotel, {
        cascade: true,
        onDelete: 'CASCADE',
    })
    templateMonoparentalRules: TemplateMonoparentalRule[];

    @OneToMany(() => TemplateEarlyBooking, (eb) => eb.hotel, {
        cascade: true,
        onDelete: 'CASCADE',
    })
    templateEarlyBookings: TemplateEarlyBooking[];

    @OneToMany(() => TemplateSpo, (spo) => spo.hotel, {
        cascade: true,
        onDelete: 'CASCADE',
    })
    templateSpos: TemplateSpo[];

    @OneToMany(() => TemplateCancellationRule, (rule) => rule.hotel, {
        cascade: true,
        onDelete: 'CASCADE',
    })
    templateCancellationRules: TemplateCancellationRule[];

    @ManyToMany(() => User, (user) => user.hotels)
    users: User[];

    @ManyToOne(() => Tenant, (tenant) => tenant.hotels, { nullable: true })
    @JoinColumn({ name: 'tenantId' })
    tenant: Tenant;

    @Column({ nullable: true })
    tenantId: number;

    @OneToMany(() => Affiliate, (affiliate) => affiliate.hotel, {
        cascade: true,
        onDelete: 'CASCADE',
    })
    affiliates: Affiliate[];

    @OneToMany(() => AffiliateEmailSpo, (emailSpo) => emailSpo.hotel, {
        cascade: false,
        onDelete: 'CASCADE',
    })
    affiliateEmailSpos: AffiliateEmailSpo[];

    @DeleteDateColumn()
    deletedAt: Date;
}
