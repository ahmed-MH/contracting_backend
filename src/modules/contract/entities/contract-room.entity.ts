import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Contract } from './contract.entity';
import { RoomType } from '../../hotel/entities/room-type.entity';

@Entity()
export class ContractRoom {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    alias: string;

    @Column({ nullable: true })
    description: string;

    @ManyToOne(() => Contract, (contract) => contract.contractRooms, {
        onDelete: 'CASCADE',
    })
    contract: Contract;

    @ManyToOne(() => RoomType)
    roomType: RoomType;
}
