import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { ProformaInvoiceStatus } from '../../../common/constants/enums';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { Affiliate } from '../../affiliate/entities/affiliate.entity';
import { Contract } from '../../contract/core/entities/contract.entity';
import { User } from '../../users/entities/user.entity';

@Entity()
export class ProformaInvoice {
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
        default: ProformaInvoiceStatus.GENERATED,
    })
    status: ProformaInvoiceStatus;

    @Column({ type: 'varchar', length: 10 })
    currency: string;

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

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
