import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Contract } from './contract.entity';
import { Affiliate } from '../../../affiliate/entities/affiliate.entity';

@Entity()
export class ContractExportSnapshot {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Contract, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'contractId' })
    contract: Contract;

    @Column()
    contractId: number;

    @ManyToOne(() => Affiliate, { onDelete: 'NO ACTION' })
    @JoinColumn({ name: 'partnerId' })
    partner: Affiliate;

    @Column()
    partnerId: number;

    @Column({ length: 2 })
    language: string;

    @Column({ length: 3 })
    outputCurrency: string;

    @Column({ length: 64 })
    exchangeRateSource: string;

    @Column({
        type: 'nvarchar',
        length: 'MAX',
        transformer: {
            to: (value: unknown) => (value ? JSON.stringify(value) : null),
            from: (value: string): unknown => (value ? JSON.parse(value) : null),
        },
    })
    exchangeRateValuesUsed: Record<string, unknown>;

    @CreateDateColumn()
    generatedAt: Date;

    @Column({ type: 'int', nullable: true })
    generatedBy: number | null;
}
