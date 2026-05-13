import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { Subscription } from '../../subscriptions/entities/subscription.entity';

@Entity()
export class Tenant {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ default: true })
    isActive: boolean;

    @Column({ type: 'nvarchar', length: 255, nullable: true })
    stripeCustomerId: string | null;

    @OneToMany(() => User, (user) => user.tenant)
    users: User[];

    @OneToMany(() => Hotel, (hotel) => hotel.tenant)
    hotels: Hotel[];

    @OneToMany(() => Subscription, (subscription) => subscription.tenant)
    subscriptions: Subscription[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
