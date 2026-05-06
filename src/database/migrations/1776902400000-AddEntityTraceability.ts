import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEntityTraceability1776902400000 implements MigrationInterface {
    name = 'AddEntityTraceability1776902400000';

    private readonly tablesWithNewTimestamps = [
        'hotel',
        'affiliate',
        'arrangement',
        'room_type',
        'contract',
        'contract_export_snapshot',
        'template_supplement',
        'template_reduction',
        'template_monoparental_rule',
        'template_early_booking',
        'template_spo',
        'template_cancellation_rule',
    ];

    private readonly allAuditedTables = [
        ...this.tablesWithNewTimestamps,
        'exchange_rate',
        'proforma_invoice',
    ];

    public async up(queryRunner: QueryRunner): Promise<void> {
        for (const table of this.allAuditedTables) {
            await this.addAuditColumns(queryRunner, table);
        }

        for (const table of this.tablesWithNewTimestamps) {
            await queryRunner.query(`
                UPDATE [${table}]
                SET
                    [createdAt] = COALESCE([createdAt], SYSUTCDATETIME()),
                    [updatedAt] = COALESCE([updatedAt], [createdAt], SYSUTCDATETIME())
            `);
        }

        await queryRunner.query(`
            UPDATE er
            SET
                er.[createdAt] = COALESCE(er.[createdAt], er.[updatedAt], SYSUTCDATETIME()),
                er.[updatedAt] = COALESCE(er.[updatedAt], er.[createdAt], SYSUTCDATETIME()),
                er.[updatedByName] = COALESCE(er.[updatedByName], er.[updatedBy]),
                er.[updatedByEmail] = COALESCE(
                    er.[updatedByEmail],
                    CASE WHEN er.[updatedBy] LIKE '%_@_%._%' THEN er.[updatedBy] ELSE NULL END
                )
            FROM [exchange_rate] er
        `);

        await queryRunner.query(`
            UPDATE pf
            SET
                pf.[createdAt] = COALESCE(pf.[createdAt], pf.[updatedAt], pf.[generatedAt], SYSUTCDATETIME()),
                pf.[updatedAt] = COALESCE(pf.[updatedAt], pf.[createdAt], pf.[generatedAt], SYSUTCDATETIME()),
                pf.[createdByUserId] = COALESCE(pf.[createdByUserId], pf.[generatedByUserId]),
                pf.[createdByName] = COALESCE(
                    pf.[createdByName],
                    NULLIF(LTRIM(RTRIM(CONCAT(COALESCE(u.[firstName], ''), ' ', COALESCE(u.[lastName], '')))), ''),
                    u.[email]
                ),
                pf.[createdByEmail] = COALESCE(pf.[createdByEmail], u.[email]),
                pf.[updatedByUserId] = COALESCE(
                    pf.[updatedByUserId],
                    CASE WHEN pf.[updatedAt] = pf.[createdAt] THEN pf.[generatedByUserId] ELSE NULL END
                ),
                pf.[updatedByName] = COALESCE(
                    pf.[updatedByName],
                    CASE
                        WHEN pf.[updatedAt] = pf.[createdAt]
                            THEN COALESCE(NULLIF(LTRIM(RTRIM(CONCAT(COALESCE(u.[firstName], ''), ' ', COALESCE(u.[lastName], '')))), ''), u.[email])
                        ELSE NULL
                    END
                ),
                pf.[updatedByEmail] = COALESCE(
                    pf.[updatedByEmail],
                    CASE WHEN pf.[updatedAt] = pf.[createdAt] THEN u.[email] ELSE NULL END
                )
            FROM [proforma_invoice] pf
            LEFT JOIN [user] u ON u.[id] = pf.[generatedByUserId]
        `);

        await queryRunner.query(`
            UPDATE ces
            SET
                ces.[createdAt] = COALESCE(ces.[createdAt], ces.[generatedAt], SYSUTCDATETIME()),
                ces.[updatedAt] = COALESCE(ces.[updatedAt], ces.[generatedAt], ces.[createdAt], SYSUTCDATETIME()),
                ces.[createdByUserId] = COALESCE(ces.[createdByUserId], ces.[generatedBy]),
                ces.[createdByName] = COALESCE(
                    ces.[createdByName],
                    NULLIF(LTRIM(RTRIM(CONCAT(COALESCE(u.[firstName], ''), ' ', COALESCE(u.[lastName], '')))), ''),
                    u.[email]
                ),
                ces.[createdByEmail] = COALESCE(ces.[createdByEmail], u.[email]),
                ces.[updatedByUserId] = COALESCE(ces.[updatedByUserId], ces.[generatedBy]),
                ces.[updatedByName] = COALESCE(
                    ces.[updatedByName],
                    NULLIF(LTRIM(RTRIM(CONCAT(COALESCE(u.[firstName], ''), ' ', COALESCE(u.[lastName], '')))), ''),
                    u.[email]
                ),
                ces.[updatedByEmail] = COALESCE(ces.[updatedByEmail], u.[email])
            FROM [contract_export_snapshot] ces
            LEFT JOIN [user] u ON u.[id] = ces.[generatedBy]
        `);

        for (const table of this.allAuditedTables) {
            await this.ensureTimestampDefaults(queryRunner, table);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const table of this.allAuditedTables) {
            await this.dropAuditIdentityColumns(queryRunner, table);
        }

        for (const table of this.tablesWithNewTimestamps) {
            await this.dropTimestampDefaults(queryRunner, table);
            await queryRunner.query(`IF COL_LENGTH('${table}', 'updatedAt') IS NOT NULL ALTER TABLE [${table}] DROP COLUMN [updatedAt]`);
            await queryRunner.query(`IF COL_LENGTH('${table}', 'createdAt') IS NOT NULL ALTER TABLE [${table}] DROP COLUMN [createdAt]`);
        }
    }

    private async addAuditColumns(queryRunner: QueryRunner, table: string): Promise<void> {
        await queryRunner.query(`
            IF COL_LENGTH('${table}', 'createdAt') IS NULL
                ALTER TABLE [${table}] ADD [createdAt] datetime2 NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('${table}', 'updatedAt') IS NULL
                ALTER TABLE [${table}] ADD [updatedAt] datetime2 NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('${table}', 'createdByUserId') IS NULL
                ALTER TABLE [${table}] ADD [createdByUserId] int NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('${table}', 'createdByName') IS NULL
                ALTER TABLE [${table}] ADD [createdByName] nvarchar(255) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('${table}', 'createdByEmail') IS NULL
                ALTER TABLE [${table}] ADD [createdByEmail] nvarchar(255) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('${table}', 'updatedByUserId') IS NULL
                ALTER TABLE [${table}] ADD [updatedByUserId] int NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('${table}', 'updatedByName') IS NULL
                ALTER TABLE [${table}] ADD [updatedByName] nvarchar(255) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('${table}', 'updatedByEmail') IS NULL
                ALTER TABLE [${table}] ADD [updatedByEmail] nvarchar(255) NULL
        `);
    }

    private async ensureTimestampDefaults(queryRunner: QueryRunner, table: string): Promise<void> {
        await queryRunner.query(`
            IF NOT EXISTS (
                SELECT 1
                FROM sys.default_constraints dc
                INNER JOIN sys.columns c
                    ON c.[default_object_id] = dc.[object_id]
                WHERE dc.[parent_object_id] = OBJECT_ID('${table}')
                    AND c.[name] = 'createdAt'
            )
                ALTER TABLE [${table}] ADD CONSTRAINT [DF_${table}_createdAt] DEFAULT SYSUTCDATETIME() FOR [createdAt]
        `);

        await queryRunner.query(`
            IF NOT EXISTS (
                SELECT 1
                FROM sys.default_constraints dc
                INNER JOIN sys.columns c
                    ON c.[default_object_id] = dc.[object_id]
                WHERE dc.[parent_object_id] = OBJECT_ID('${table}')
                    AND c.[name] = 'updatedAt'
            )
                ALTER TABLE [${table}] ADD CONSTRAINT [DF_${table}_updatedAt] DEFAULT SYSUTCDATETIME() FOR [updatedAt]
        `);

        await queryRunner.query(`ALTER TABLE [${table}] ALTER COLUMN [createdAt] datetime2 NOT NULL`);
        await queryRunner.query(`ALTER TABLE [${table}] ALTER COLUMN [updatedAt] datetime2 NOT NULL`);
    }

    private async dropAuditIdentityColumns(queryRunner: QueryRunner, table: string): Promise<void> {
        await queryRunner.query(`IF COL_LENGTH('${table}', 'updatedByEmail') IS NOT NULL ALTER TABLE [${table}] DROP COLUMN [updatedByEmail]`);
        await queryRunner.query(`IF COL_LENGTH('${table}', 'updatedByName') IS NOT NULL ALTER TABLE [${table}] DROP COLUMN [updatedByName]`);
        await queryRunner.query(`IF COL_LENGTH('${table}', 'updatedByUserId') IS NOT NULL ALTER TABLE [${table}] DROP COLUMN [updatedByUserId]`);
        await queryRunner.query(`IF COL_LENGTH('${table}', 'createdByEmail') IS NOT NULL ALTER TABLE [${table}] DROP COLUMN [createdByEmail]`);
        await queryRunner.query(`IF COL_LENGTH('${table}', 'createdByName') IS NOT NULL ALTER TABLE [${table}] DROP COLUMN [createdByName]`);
        await queryRunner.query(`IF COL_LENGTH('${table}', 'createdByUserId') IS NOT NULL ALTER TABLE [${table}] DROP COLUMN [createdByUserId]`);
    }

    private async dropTimestampDefaults(queryRunner: QueryRunner, table: string): Promise<void> {
        await queryRunner.query(`
            IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE [name] = 'DF_${table}_updatedAt')
                ALTER TABLE [${table}] DROP CONSTRAINT [DF_${table}_updatedAt]
        `);
        await queryRunner.query(`
            IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE [name] = 'DF_${table}_createdAt')
                ALTER TABLE [${table}] DROP CONSTRAINT [DF_${table}_createdAt]
        `);
    }
}
