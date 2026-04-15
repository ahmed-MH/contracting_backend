import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorExchangeRates1776297600000 implements MigrationInterface {
    name = 'RefactorExchangeRates1776297600000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF COL_LENGTH('exchange_rate', 'fromCurrency') IS NULL
                ALTER TABLE [exchange_rate] ADD [fromCurrency] nvarchar(3) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('exchange_rate', 'toCurrency') IS NULL
                ALTER TABLE [exchange_rate] ADD [toCurrency] nvarchar(3) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('exchange_rate', 'effectiveDate') IS NULL
                ALTER TABLE [exchange_rate] ADD [effectiveDate] date NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('exchange_rate', 'source') IS NULL
                ALTER TABLE [exchange_rate] ADD [source] nvarchar(20) NOT NULL CONSTRAINT [DF_exchange_rate_source] DEFAULT 'manual'
        `);
        await queryRunner.query(`
            IF COL_LENGTH('exchange_rate', 'updatedBy') IS NULL
                ALTER TABLE [exchange_rate] ADD [updatedBy] nvarchar(255) NULL
        `);

        await queryRunner.query(`
            UPDATE er
            SET
                er.[fromCurrency] = COALESCE(er.[fromCurrency], UPPER(er.[currency])),
                er.[toCurrency] = COALESCE(er.[toCurrency], UPPER(h.[defaultCurrency])),
                er.[effectiveDate] = COALESCE(er.[effectiveDate], er.[validFrom]),
                er.[source] = COALESCE(er.[source], 'manual')
            FROM [exchange_rate] er
            INNER JOIN [hotel] h ON h.[id] = er.[hotelId]
        `);

        await queryRunner.query(`ALTER TABLE [exchange_rate] ALTER COLUMN [fromCurrency] nvarchar(3) NOT NULL`);
        await queryRunner.query(`ALTER TABLE [exchange_rate] ALTER COLUMN [toCurrency] nvarchar(3) NOT NULL`);
        await queryRunner.query(`ALTER TABLE [exchange_rate] ALTER COLUMN [effectiveDate] date NOT NULL`);

        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IDX_exchange_rate_pair_effective' AND object_id = OBJECT_ID('exchange_rate'))
                CREATE INDEX [IDX_exchange_rate_pair_effective] ON [exchange_rate] ([hotelId], [fromCurrency], [toCurrency], [effectiveDate])
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IDX_exchange_rate_pair_effective' AND object_id = OBJECT_ID('exchange_rate'))
                DROP INDEX [IDX_exchange_rate_pair_effective] ON [exchange_rate]
        `);
        await queryRunner.query(`IF COL_LENGTH('exchange_rate', 'updatedBy') IS NOT NULL ALTER TABLE [exchange_rate] DROP COLUMN [updatedBy]`);
        await queryRunner.query(`
            IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_exchange_rate_source')
                ALTER TABLE [exchange_rate] DROP CONSTRAINT [DF_exchange_rate_source]
        `);
        await queryRunner.query(`IF COL_LENGTH('exchange_rate', 'source') IS NOT NULL ALTER TABLE [exchange_rate] DROP COLUMN [source]`);
        await queryRunner.query(`IF COL_LENGTH('exchange_rate', 'effectiveDate') IS NOT NULL ALTER TABLE [exchange_rate] DROP COLUMN [effectiveDate]`);
        await queryRunner.query(`IF COL_LENGTH('exchange_rate', 'toCurrency') IS NOT NULL ALTER TABLE [exchange_rate] DROP COLUMN [toCurrency]`);
        await queryRunner.query(`IF COL_LENGTH('exchange_rate', 'fromCurrency') IS NOT NULL ALTER TABLE [exchange_rate] DROP COLUMN [fromCurrency]`);
    }
}
