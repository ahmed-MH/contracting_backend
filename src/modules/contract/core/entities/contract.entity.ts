import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToMany,
    JoinTable,
    OneToMany,
    ManyToOne,
    Index,
} from 'typeorm';
import { ContractStatus, PaymentConditionType, PaymentMethodType } from '../../../../common/constants/enums';
import { Affiliate } from '../../../affiliate/entities/affiliate.entity';
import { Hotel } from '../../../hotel/entities/hotel.entity';
import { Arrangement } from '../../../hotel/entities/arrangement.entity';
import { Period } from './period.entity';
import { ContractRoom } from './contract-room.entity';
import { ContractSupplement } from '../../supplement/entities/contract-supplement.entity';
import { ContractReduction } from '../../reduction/entities/contract-reduction.entity';
import { ContractMonoparentalRule } from '../../monoparental/entities/contract-monoparental-rule.entity';
import { ContractEarlyBooking } from '../../early-booking/entities/contract-early-booking.entity';
import { ContractSpo } from '../../spo/entities/contract-spo.entity';
import { ContractCancellationRule } from '../../cancellation/entities/contract-cancellation-rule.entity';

@Entity()
@Index('IDX_CONTRACT_REFERENCE', ['reference'], { unique: true, where: 'reference IS NOT NULL' })
export class Contract {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    reference: string;

    @Column()
    name: string;

    @Column({ type: 'date' })
    startDate: Date;

    @Column({ type: 'date' })
    endDate: Date;

    @Column()
    currency: string;

    @Column({
        type: 'simple-enum',
        enum: ContractStatus,
        default: ContractStatus.DRAFT,
    })
    status: ContractStatus;

    // ─── Payment Policy ──────────────────────────────────────────

    @Column({
        type: 'simple-enum',
        enum: PaymentConditionType,
        nullable: true,
    })
    paymentCondition: PaymentConditionType;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    depositAmount: number;

    @Column({ type: 'int', nullable: true })
    creditDays: number;

    @Column({
        type: 'simple-array',
        nullable: true,
    })
    paymentMethods: PaymentMethodType[];

    @ManyToMany(() => Affiliate, (affiliate) => affiliate.contracts)
    @JoinTable({ name: 'contract_affiliates' })
    affiliates: Affiliate[];

    @ManyToOne(() => Hotel, { onDelete: 'CASCADE' })
    hotel: Hotel;

    @Column()
    hotelId: number;

    @ManyToOne(() => Arrangement, { nullable: true })
    baseArrangement: Arrangement | null;

    @Column({ nullable: true })
    baseArrangementId: number | null;

    @OneToMany(() => Period, (period) => period.contract, {
        cascade: true,
        onDelete: 'CASCADE',
    })
    periods: Period[];

    @OneToMany(() => ContractRoom, (contractRoom) => contractRoom.contract, {
        cascade: true,
        onDelete: 'CASCADE',
    })
    contractRooms: ContractRoom[];

    @OneToMany(() => ContractSupplement, (supplement) => supplement.contract, {
        cascade: true,
        onDelete: 'CASCADE',
    })
    supplements: ContractSupplement[];

    @OneToMany(() => ContractReduction, (reduction) => reduction.contract)
    reductions: ContractReduction[];

    @OneToMany(() => ContractMonoparentalRule, (rule) => rule.contract)
    monoparentalRules: ContractMonoparentalRule[];

    @OneToMany(() => ContractEarlyBooking, (eb) => eb.contract, {
        cascade: true,
        onDelete: 'CASCADE',
    })
    earlyBookings: ContractEarlyBooking[];

    @OneToMany(() => ContractSpo, (spo) => spo.contract, {
        cascade: true,
        onDelete: 'CASCADE',
    })
    contractSpos: ContractSpo[];

    @OneToMany(() => ContractCancellationRule, (rule) => rule.contract, {
        cascade: true,
        onDelete: 'CASCADE',
    })
    cancellationRules: ContractCancellationRule[];
}
