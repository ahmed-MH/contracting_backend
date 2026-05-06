import { Exclude } from 'class-transformer';
import { Column } from 'typeorm';

export abstract class AuditableEntity {
    @Exclude()
    @Column({
        type: 'datetime2',
        default: () => 'SYSUTCDATETIME()',
    })
    createdAt: Date;

    @Column({
        type: 'datetime2',
        default: () => 'SYSUTCDATETIME()',
    })
    updatedAt: Date;

    @Exclude()
    @Column({ type: 'int', nullable: true })
    createdByUserId: number | null;

    @Exclude()
    @Column({ type: 'nvarchar', length: 255, nullable: true })
    createdByName: string | null;

    @Exclude()
    @Column({ type: 'nvarchar', length: 255, nullable: true })
    createdByEmail: string | null;

    @Exclude()
    @Column({ type: 'int', nullable: true })
    updatedByUserId: number | null;

    @Column({ type: 'nvarchar', length: 255, nullable: true })
    updatedByName: string | null;

    @Exclude()
    @Column({ type: 'nvarchar', length: 255, nullable: true })
    updatedByEmail: string | null;
}
