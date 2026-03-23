import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ContractSpo } from './contract-spo.entity';
import { Arrangement } from '../../../hotel/entities/arrangement.entity';

@Entity({ name: 'contract_spo_arrangements' })
export class ContractSpoArrangement {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => ContractSpo, (spo) => spo.applicableArrangements, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({ name: 'contractSpoId' })
    contractSpo: ContractSpo;

    @ManyToOne(() => Arrangement, { onDelete: 'NO ACTION', nullable: false })
    @JoinColumn({ name: 'arrangementId' })
    arrangement: Arrangement;
}
