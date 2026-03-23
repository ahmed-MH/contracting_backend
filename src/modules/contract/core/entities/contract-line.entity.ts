import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    Unique,
    OneToMany,
    ManyToMany,
    JoinTable,
} from 'typeorm';
import { Period } from './period.entity';
import { ContractRoom } from './contract-room.entity';
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

    // Allotment quota for this room/period cell (0 = no allotment defined)
    @Column({ default: 0 })
    allotment: number;

    // isContracted = false means "NOT CONTRACTED" cell (grayed out in UI)
    @Column({ default: true })
    isContracted: boolean;

    @ManyToOne(() => Period, { onDelete: 'NO ACTION' })
    period: Period;

    @ManyToOne(() => ContractRoom, { onDelete: 'NO ACTION' })
    contractRoom: ContractRoom;

    // One price per arrangement per line
    @OneToMany(() => Price, (price) => price.contractLine, { cascade: true })
    prices: Price[];

    // Flexible promo assignment — same promo can apply to multiple lines
    @ManyToMany(() => Promotion)
    @JoinTable({ name: 'contract_line_promotions' })
    promotions: Promotion[];

    @OneToMany(() => ChildPolicy, (policy) => policy.contractLine, { cascade: true })
    childPolicies: ChildPolicy[];
}
