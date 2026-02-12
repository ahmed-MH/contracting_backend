import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    Unique,
    OneToMany,
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

    @OneToMany(() => Allotment, (allotment) => allotment.contractLine)
    allotments: Allotment[];

    @OneToMany(() => Supplement, (supplement) => supplement.contractLine)
    supplements: Supplement[];

    @OneToMany(() => Promotion, (promotion) => promotion.contractLine)
    promotions: Promotion[];

    @OneToMany(() => ChildPolicy, (policy) => policy.contractLine)
    childPolicies: ChildPolicy[];

    @OneToMany(() => Price, (price) => price.contractLine)
    prices: Price[];
}
