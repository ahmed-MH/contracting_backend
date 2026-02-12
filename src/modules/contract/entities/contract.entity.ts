import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
    Index,
} from 'typeorm';
import { ContractStatus } from '../../../shared/constants/enums';
import { Affiliate } from './affiliate.entity';
import { Period } from './period.entity';
import { ContractRoom } from './contract-room.entity';

@Entity()
@Index('IDX_AFFILIATE_ACTIVE_CONTRACT', ['affiliate'], {
    unique: true,
    where: "status = 'ACTIVE'",
})
export class Contract {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    code: string;

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

    @ManyToOne(() => Affiliate, (affiliate) => affiliate.contracts)
    affiliate: Affiliate;

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
}
