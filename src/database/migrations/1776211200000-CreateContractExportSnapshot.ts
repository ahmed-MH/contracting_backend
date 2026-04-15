import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContractExportSnapshot1776211200000 implements MigrationInterface {
    name = 'CreateContractExportSnapshot1776211200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE [contract_export_snapshot] (
                [id] int NOT NULL IDENTITY(1,1),
                [contractId] int NOT NULL,
                [partnerId] int NOT NULL,
                [language] nvarchar(2) NOT NULL,
                [outputCurrency] nvarchar(3) NOT NULL,
                [exchangeRateSource] nvarchar(64) NOT NULL,
                [exchangeRateValuesUsed] nvarchar(MAX) NOT NULL,
                [generatedAt] datetime2 NOT NULL CONSTRAINT [DF_contract_export_snapshot_generatedAt] DEFAULT SYSUTCDATETIME(),
                [generatedBy] int NULL,
                CONSTRAINT [PK_contract_export_snapshot] PRIMARY KEY ([id])
            )
        `);
        await queryRunner.query(`CREATE INDEX [IDX_contract_export_snapshot_contractId] ON [contract_export_snapshot] ([contractId])`);
        await queryRunner.query(`CREATE INDEX [IDX_contract_export_snapshot_partnerId] ON [contract_export_snapshot] ([partnerId])`);
        await queryRunner.query(`
            ALTER TABLE [contract_export_snapshot]
            ADD CONSTRAINT [FK_contract_export_snapshot_contract]
            FOREIGN KEY ([contractId]) REFERENCES [contract]([id]) ON DELETE CASCADE
        `);
        await queryRunner.query(`
            ALTER TABLE [contract_export_snapshot]
            ADD CONSTRAINT [FK_contract_export_snapshot_partner]
            FOREIGN KEY ([partnerId]) REFERENCES [affiliate]([id]) ON DELETE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE [contract_export_snapshot] DROP CONSTRAINT [FK_contract_export_snapshot_partner]`);
        await queryRunner.query(`ALTER TABLE [contract_export_snapshot] DROP CONSTRAINT [FK_contract_export_snapshot_contract]`);
        await queryRunner.query(`DROP INDEX [IDX_contract_export_snapshot_partnerId] ON [contract_export_snapshot]`);
        await queryRunner.query(`DROP INDEX [IDX_contract_export_snapshot_contractId] ON [contract_export_snapshot]`);
        await queryRunner.query(`DROP TABLE [contract_export_snapshot]`);
    }
}
