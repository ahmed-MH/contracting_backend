import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ProformaStartupService implements OnApplicationBootstrap {
    private readonly logger = new Logger(ProformaStartupService.name);

    constructor(private readonly dataSource: DataSource) {}

    async onApplicationBootstrap(): Promise<void> {
        const result = await this.dataSource.query(`
            UPDATE pf
            SET
                pf.[status] = 'ISSUED',
                pf.[issuedAt] = COALESCE(pf.[issuedAt], pf.[generatedAt], pf.[updatedAt], pf.[createdAt], SYSUTCDATETIME()),
                pf.[issuedByUserId] = COALESCE(pf.[issuedByUserId], pf.[updatedByUserId], pf.[generatedByUserId], pf.[createdByUserId]),
                pf.[issuedByName] = COALESCE(pf.[issuedByName], pf.[updatedByName], pf.[createdByName], 'System'),
                pf.[issuedByEmail] = COALESCE(pf.[issuedByEmail], pf.[updatedByEmail], pf.[createdByEmail])
            FROM [proforma_invoice] pf
            WHERE pf.[status] = 'GENERATED'
        `);

        const affected = Array.isArray(result) ? Number(result[1] ?? 0) : Number(result ?? 0);
        if (Number.isFinite(affected) && affected > 0) {
            this.logger.log(`Normalized ${affected} legacy proforma invoice status value(s) from GENERATED to ISSUED.`);
        }
    }
}
