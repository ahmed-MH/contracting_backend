import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
} from 'typeorm';

/**
 * Dedicated yearly sequence counter per hotel.
 * Used by ProformaService inside a serializable transaction
 * to guarantee unique PF-YYYY-NNNN references without race conditions.
 */
@Entity()
@Index('IDX_PROFORMA_SEQ_HOTEL_YEAR', ['hotelId', 'year'], { unique: true })
export class ProformaSequence {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int' })
    hotelId: number;

    @Column({ type: 'int' })
    year: number;

    @Column({ type: 'int', default: 0 })
    lastSequence: number;
}
