import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIntegrationRateLimitIndex1777420800000 implements MigrationInterface {
    name = 'AddIntegrationRateLimitIndex1777420800000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_usage_log', 'U') IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_integration_api_usage_log_rate_limit')
                CREATE INDEX [IDX_integration_api_usage_log_rate_limit]
                ON [integration_api_usage_log] ([apiKeyId], [endpointCode], [createdAt] DESC)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_usage_log', 'U') IS NOT NULL
            AND EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_integration_api_usage_log_rate_limit')
                DROP INDEX [IDX_integration_api_usage_log_rate_limit] ON [integration_api_usage_log]
        `);
    }
}
