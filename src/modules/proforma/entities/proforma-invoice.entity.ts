import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    DeleteDateColumn,
} from 'typeorm';
import { ProformaInvoiceStatus } from '../../../common/constants/enums';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { Affiliate } from '../../affiliate/entities/affiliate.entity';
import { Contract } from '../../contract/core/entities/contract.entity';
import { User } from '../../users/entities/user.entity';
import { AuditableEntity } from '../../../common/audit/auditable.entity';

@Entity()
export class ProformaInvoice extends AuditableEntity {
    @PrimaryGeneratedColumn()
    id: number;

    // ─── References ──────────────────────────────────────────────────

    @ManyToOne(() => Hotel, { onDelete: 'NO ACTION' })
    @JoinColumn({ name: 'hotelId' })
    hotel: Hotel;

    @Column()
    hotelId: number;

    @ManyToOne(() => Affiliate, { nullable: true, onDelete: 'NO ACTION' })
    @JoinColumn({ name: 'affiliateId' })
    affiliate: Affiliate;

    @Column({ nullable: true })
    affiliateId: number;

    @ManyToOne(() => Contract, { nullable: true, onDelete: 'NO ACTION' })
    @JoinColumn({ name: 'contractId' })
    contract: Contract;

    @Column({ nullable: true })
    contractId: number;

    @ManyToOne(() => User, { nullable: true, onDelete: 'NO ACTION' })
    @JoinColumn({ name: 'generatedByUserId' })
    generatedBy: User;

    @Column({ nullable: true })
    generatedByUserId: number;

    // ─── Identity ────────────────────────────────────────────────────

    @Column({ type: 'varchar', length: 50, unique: true })
    reference: string;

    @Column({
        type: 'simple-enum',
        enum: ProformaInvoiceStatus,
        default: ProformaInvoiceStatus.DRAFT,
    })
    status: ProformaInvoiceStatus;

    @Column({ type: 'varchar', length: 10 })
    currency: string;

    @Column({ type: 'bit', default: false })
    taxEnabled: boolean;

    @Column({
        type: 'decimal',
        precision: 18,
        scale: 2,
        nullable: true,
        transformer: {
            to: (value?: number | null) => value ?? null,
            from: (value: string | number | null): number | null => (value == null ? null : Number(value)),
        },
    })
    taxAmount: number | null;

    @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
    documentLogoUrl: string;

    @Column({ type: 'varchar', length: 7, nullable: true })
    documentThemeColor: string;

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
        transformer: {
            to: (value: any) => (value ? JSON.stringify(value) : null),
            from: (value: string): any => (value ? JSON.parse(value) : null),
        },
    })
    documentSnapshot: any;

    // ─── Customer Snapshot ───────────────────────────────────────────

    @Column({ type: 'varchar', length: 255 })
    customerName: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    customerEmail: string;

    // ─── Stay Details ────────────────────────────────────────────────

    @Column({ type: 'date' })
    checkIn: Date;

    @Column({ type: 'date' })
    checkOut: Date;

    @Column({ type: 'date' })
    bookingDate: Date;

    @Column({ type: 'varchar', length: 100, nullable: true })
    voucherNumber: string | null;

    @Column({ type: 'varchar', length: 100 })
    boardTypeName: string;

    // ─── Snapshots (JSON) ────────────────────────────────────────────

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        transformer: {
            to: (value: any) => (value ? JSON.stringify(value) : null),
            from: (value: string): any => (value ? JSON.parse(value) : null),
        },
    })
    roomingSummary: any;

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        transformer: {
            to: (value: any) => (value ? JSON.stringify(value) : null),
            from: (value: string): any => (value ? JSON.parse(value) : null),
        },
    })
    simulationInputSnapshot: any;

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        transformer: {
            to: (value: any) => (value ? JSON.stringify(value) : null),
            from: (value: string): any => (value ? JSON.parse(value) : null),
        },
    })
    calculationSnapshot: any;

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        transformer: {
            to: (value: any) => (value ? JSON.stringify(value) : null),
            from: (value: string): any => (value ? JSON.parse(value) : null),
        },
    })
    totalsSnapshot: any;

    // ─── Notes ───────────────────────────────────────────────────────

    @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
    notes: string;

    // ─── Timestamps ──────────────────────────────────────────────────

    @Column({ type: 'datetime' })
    generatedAt: Date;

    @Column({ type: 'datetime2', nullable: true })
    issuedAt: Date | null;

    @Column({ type: 'int', nullable: true })
    issuedByUserId: number | null;

    @Column({ type: 'nvarchar', length: 255, nullable: true })
    issuedByName: string | null;

    @Column({ type: 'nvarchar', length: 255, nullable: true })
    issuedByEmail: string | null;

    @DeleteDateColumn()
    deletedAt: Date | null;
}
