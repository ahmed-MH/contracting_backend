import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Promotion {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    discountValue: number;

    @Column({ nullable: true })
    condition: string;

    // Inverse side removed — relation is now ManyToMany owned by ContractLine
    // Access via ContractLine.promotions
}
