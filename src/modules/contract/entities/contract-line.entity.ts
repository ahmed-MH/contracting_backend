import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    Unique,
    OneToMany,
    OneToOne,
    ManyToMany,
    JoinTable,
    JoinColumn,
} from 'typeorm';
import { Period } from './period.entity';
import { ContractRoom } from './contract-room.entity';
import { Allotment } from './allotment.entity';
import { Supplement } from './supplement.entity';
import { Promotion } from './promotion.entity';
import { ChildPolicy } from './child-policy.entity';
import { Price } from './price.entity';

@Entity()
@Unique(['period', 'contractRoom'])
export class ContractLine {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ nullable: true })
    description: string;

    @ManyToOne(() => Period, { onDelete: 'NO ACTION' })
    period: Period;

    @ManyToOne(() => ContractRoom, { onDelete: 'NO ACTION' })
    contractRoom: ContractRoom;

    // One price per arrangement per line
    @OneToMany(() => Price, (price) => price.contractLine, { cascade: true })
    prices: Price[];

    // Single allotment quota per line
    @OneToOne(() => Allotment, (allotment) => allotment.contractLine, { cascade: true })
    @JoinColumn()
    allotment: Allotment;

    // Flexible promo assignment — same promo can apply to multiple lines
    @ManyToMany(() => Promotion)
    @JoinTable({ name: 'contract_line_promotions' })
    promotions: Promotion[];

    // Flexible supplement assignment — same supplement can apply to multiple lines
    @ManyToMany(() => Supplement)
    @JoinTable({ name: 'contract_line_supplements' })
    supplements: Supplement[];

    @OneToMany(() => ChildPolicy, (policy) => policy.contractLine, { cascade: true })
    childPolicies: ChildPolicy[];
}
