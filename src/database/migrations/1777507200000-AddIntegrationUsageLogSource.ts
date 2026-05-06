import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIntegrationUsageLogSource1777507200000 implements MigrationInterface {
    name = 'AddIntegrationUsageLogSource1777507200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_usage_log', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_usage_log', 'source') IS NULL
                ALTER TABLE [integration_api_usage_log]
                ADD [source] varchar(20) NOT NULL
                    CONSTRAINT [DF_integration_api_usage_log_source] DEFAULT 'PUBLIC_API'
        `);

        await queryRunner.query(`
            IF OBJECT_ID('integration_api_usage_log', 'U') IS NOT NULL
                UPDATE [integration_api_usage_log]
                SET [source] = 'PUBLIC_API'
                WHERE [source] IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_usage_log', 'U') IS NOT NULL
            AND COL_LENGTH('integration_api_usage_log', 'source') IS NOT NULL
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM sys.default_constraints
                    WHERE parent_object_id = OBJECT_ID('integration_api_usage_log')
                    AND name = 'DF_integration_api_usage_log_source'
                )
                    ALTER TABLE [integration_api_usage_log] DROP CONSTRAINT [DF_integration_api_usage_log_source];

                ALTER TABLE [integration_api_usage_log] DROP COLUMN [source];
            END
        `);
    }
}
