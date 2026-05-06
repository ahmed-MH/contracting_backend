import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIntegrationPhaseTwoOps1777593600000 implements MigrationInterface {
    name = 'AddIntegrationPhaseTwoOps1777593600000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_key', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_key', 'environment') IS NULL
                ALTER TABLE [integration_api_key]
                ADD [environment] varchar(20) NOT NULL
                    CONSTRAINT [DF_integration_api_key_environment] DEFAULT 'TEST'
        `);

        await queryRunner.query(`
            IF OBJECT_ID('integration_api_key', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_key', 'allowedIps') IS NULL
                ALTER TABLE [integration_api_key]
                ADD [allowedIps] nvarchar(MAX) NULL
        `);

        await queryRunner.query(`
            IF OBJECT_ID('integration_api_key', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_key', 'rotatedFromKeyId') IS NULL
                ALTER TABLE [integration_api_key]
                ADD [rotatedFromKeyId] int NULL
        `);

        await queryRunner.query(`
            IF OBJECT_ID('integration_api_key', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_key', 'rotatedToKeyId') IS NULL
                ALTER TABLE [integration_api_key]
                ADD [rotatedToKeyId] int NULL
        `);

        await queryRunner.query(`
            IF OBJECT_ID('integration_api_key', 'U') IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = 'FK_integration_api_key_rotatedFrom')
                ALTER TABLE [integration_api_key]
                ADD CONSTRAINT [FK_integration_api_key_rotatedFrom]
                FOREIGN KEY ([rotatedFromKeyId]) REFERENCES [integration_api_key]([id]) ON DELETE NO ACTION
        `);

        await queryRunner.query(`
            IF OBJECT_ID('integration_api_key', 'U') IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = 'FK_integration_api_key_rotatedTo')
                ALTER TABLE [integration_api_key]
                ADD CONSTRAINT [FK_integration_api_key_rotatedTo]
                FOREIGN KEY ([rotatedToKeyId]) REFERENCES [integration_api_key]([id]) ON DELETE NO ACTION
        `);

        await queryRunner.query(`
            IF OBJECT_ID('integration_api_usage_log', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_usage_log', 'apiKeyEnvironment') IS NULL
                ALTER TABLE [integration_api_usage_log]
                ADD [apiKeyEnvironment] varchar(20) NULL
        `);

        await queryRunner.query(`
            IF OBJECT_ID('integration_api_usage_log', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_usage_log', 'requestJson') IS NULL
                ALTER TABLE [integration_api_usage_log]
                ADD [requestJson] nvarchar(MAX) NULL
        `);

        await queryRunner.query(`
            IF OBJECT_ID('integration_api_usage_log', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_usage_log', 'responseJson') IS NULL
                ALTER TABLE [integration_api_usage_log]
                ADD [responseJson] nvarchar(MAX) NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_usage_log', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_usage_log', 'responseJson') IS NOT NULL
                ALTER TABLE [integration_api_usage_log] DROP COLUMN [responseJson]
        `);
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_usage_log', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_usage_log', 'requestJson') IS NOT NULL
                ALTER TABLE [integration_api_usage_log] DROP COLUMN [requestJson]
        `);
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_usage_log', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_usage_log', 'apiKeyEnvironment') IS NOT NULL
                ALTER TABLE [integration_api_usage_log] DROP COLUMN [apiKeyEnvironment]
        `);
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_key', 'U') IS NOT NULL
            AND EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = 'FK_integration_api_key_rotatedTo')
                ALTER TABLE [integration_api_key] DROP CONSTRAINT [FK_integration_api_key_rotatedTo]
        `);
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_key', 'U') IS NOT NULL
            AND EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = 'FK_integration_api_key_rotatedFrom')
                ALTER TABLE [integration_api_key] DROP CONSTRAINT [FK_integration_api_key_rotatedFrom]
        `);
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_key', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_key', 'rotatedToKeyId') IS NOT NULL
                ALTER TABLE [integration_api_key] DROP COLUMN [rotatedToKeyId]
        `);
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_key', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_key', 'rotatedFromKeyId') IS NOT NULL
                ALTER TABLE [integration_api_key] DROP COLUMN [rotatedFromKeyId]
        `);
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_key', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_key', 'allowedIps') IS NOT NULL
                ALTER TABLE [integration_api_key] DROP COLUMN [allowedIps]
        `);
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_key', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_key', 'environment') IS NOT NULL
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM sys.default_constraints
                    WHERE parent_object_id = OBJECT_ID('integration_api_key')
                    AND name = 'DF_integration_api_key_environment'
                )
                    ALTER TABLE [integration_api_key] DROP CONSTRAINT [DF_integration_api_key_environment];

                ALTER TABLE [integration_api_key] DROP COLUMN [environment];
            END
        `);
    }
}
