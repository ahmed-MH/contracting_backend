import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIntegrationsModule1777334400000 implements MigrationInterface {
    name = 'CreateIntegrationsModule1777334400000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('integration_api_user', 'U') IS NULL
            CREATE TABLE [integration_api_user] (
                [id] int IDENTITY(1,1) NOT NULL,
                [name] nvarchar(255) NOT NULL,
                [description] nvarchar(1000) NULL,
                [status] varchar(20) NOT NULL CONSTRAINT [DF_integration_api_user_status] DEFAULT 'ACTIVE',
                [tenantId] int NULL,
                [permissions] nvarchar(1000) NULL,
                [createdAt] datetime2 NOT NULL CONSTRAINT [DF_integration_api_user_createdAt] DEFAULT SYSUTCDATETIME(),
                [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_integration_api_user_updatedAt] DEFAULT SYSUTCDATETIME(),
                [createdByUserId] int NULL,
                [createdByName] nvarchar(255) NULL,
                [createdByEmail] nvarchar(255) NULL,
                [updatedByUserId] int NULL,
                [updatedByName] nvarchar(255) NULL,
                [updatedByEmail] nvarchar(255) NULL,
                CONSTRAINT [PK_integration_api_user] PRIMARY KEY ([id])
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('integration_api_key', 'U') IS NULL
            CREATE TABLE [integration_api_key] (
                [id] int IDENTITY(1,1) NOT NULL,
                [name] nvarchar(255) NOT NULL,
                [prefix] nvarchar(64) NOT NULL,
                [hashedSecret] nvarchar(255) NOT NULL,
                [apiUserId] int NOT NULL,
                [status] varchar(20) NOT NULL CONSTRAINT [DF_integration_api_key_status] DEFAULT 'ACTIVE',
                [expiresAt] datetime2 NULL,
                [lastUsedAt] datetime2 NULL,
                [createdAt] datetime2 NOT NULL CONSTRAINT [DF_integration_api_key_createdAt] DEFAULT SYSUTCDATETIME(),
                [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_integration_api_key_updatedAt] DEFAULT SYSUTCDATETIME(),
                [createdByUserId] int NULL,
                [createdByName] nvarchar(255) NULL,
                [createdByEmail] nvarchar(255) NULL,
                [updatedByUserId] int NULL,
                [updatedByName] nvarchar(255) NULL,
                [updatedByEmail] nvarchar(255) NULL,
                CONSTRAINT [PK_integration_api_key] PRIMARY KEY ([id]),
                CONSTRAINT [UQ_integration_api_key_prefix] UNIQUE ([prefix]),
                CONSTRAINT [FK_integration_api_key_apiUser] FOREIGN KEY ([apiUserId]) REFERENCES [integration_api_user]([id]) ON DELETE NO ACTION
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('integration_endpoint', 'U') IS NULL
            CREATE TABLE [integration_endpoint] (
                [id] int IDENTITY(1,1) NOT NULL,
                [tenantId] int NULL,
                [code] nvarchar(100) NOT NULL,
                [method] nvarchar(16) NOT NULL,
                [path] nvarchar(255) NOT NULL,
                [version] nvarchar(32) NOT NULL,
                [status] varchar(20) NOT NULL CONSTRAINT [DF_integration_endpoint_status] DEFAULT 'ACTIVE',
                [requiresApiKey] bit NOT NULL CONSTRAINT [DF_integration_endpoint_requiresApiKey] DEFAULT 1,
                [rateLimitPerMinute] int NOT NULL CONSTRAINT [DF_integration_endpoint_rateLimitPerMinute] DEFAULT 60,
                [requestSchemaJson] nvarchar(MAX) NULL,
                [responseSchemaJson] nvarchar(MAX) NULL,
                [createdAt] datetime2 NOT NULL CONSTRAINT [DF_integration_endpoint_createdAt] DEFAULT SYSUTCDATETIME(),
                [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_integration_endpoint_updatedAt] DEFAULT SYSUTCDATETIME(),
                [createdByUserId] int NULL,
                [createdByName] nvarchar(255) NULL,
                [createdByEmail] nvarchar(255) NULL,
                [updatedByUserId] int NULL,
                [updatedByName] nvarchar(255) NULL,
                [updatedByEmail] nvarchar(255) NULL,
                CONSTRAINT [PK_integration_endpoint] PRIMARY KEY ([id]),
                CONSTRAINT [UQ_integration_endpoint_code_tenant] UNIQUE ([code], [tenantId])
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('integration_api_usage_log', 'U') IS NULL
            CREATE TABLE [integration_api_usage_log] (
                [id] int IDENTITY(1,1) NOT NULL,
                [tenantId] int NULL,
                [endpointCode] nvarchar(100) NOT NULL,
                [apiUserId] int NULL,
                [apiKeyId] int NULL,
                [hotelId] int NULL,
                [requestId] nvarchar(100) NULL,
                [externalReservationCode] nvarchar(100) NULL,
                [statusCode] int NOT NULL,
                [success] bit NOT NULL CONSTRAINT [DF_integration_api_usage_log_success] DEFAULT 0,
                [errorCode] nvarchar(100) NULL,
                [errorMessage] nvarchar(2000) NULL,
                [durationMs] int NOT NULL,
                [ipAddress] nvarchar(255) NULL,
                [createdAt] datetime2 NOT NULL CONSTRAINT [DF_integration_api_usage_log_createdAt] DEFAULT SYSUTCDATETIME(),
                CONSTRAINT [PK_integration_api_usage_log] PRIMARY KEY ([id]),
                CONSTRAINT [FK_integration_api_usage_log_apiUser] FOREIGN KEY ([apiUserId]) REFERENCES [integration_api_user]([id]) ON DELETE SET NULL,
                CONSTRAINT [FK_integration_api_usage_log_apiKey] FOREIGN KEY ([apiKeyId]) REFERENCES [integration_api_key]([id]) ON DELETE SET NULL,
                CONSTRAINT [FK_integration_api_usage_log_hotel] FOREIGN KEY ([hotelId]) REFERENCES [hotel]([id]) ON DELETE SET NULL
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('integration_api_user_allowed_hotel', 'U') IS NULL
            CREATE TABLE [integration_api_user_allowed_hotel] (
                [integrationApiUserId] int NOT NULL,
                [hotelId] int NOT NULL,
                CONSTRAINT [PK_integration_api_user_allowed_hotel] PRIMARY KEY ([integrationApiUserId], [hotelId]),
                CONSTRAINT [FK_integration_api_user_allowed_hotel_user] FOREIGN KEY ([integrationApiUserId]) REFERENCES [integration_api_user]([id]) ON DELETE CASCADE,
                CONSTRAINT [FK_integration_api_user_allowed_hotel_hotel] FOREIGN KEY ([hotelId]) REFERENCES [hotel]([id]) ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_integration_api_usage_log_lookup')
                CREATE INDEX [IDX_integration_api_usage_log_lookup]
                ON [integration_api_usage_log] ([tenantId], [endpointCode], [createdAt] DESC)
        `);

    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_integration_api_usage_log_lookup')
                DROP INDEX [IDX_integration_api_usage_log_lookup] ON [integration_api_usage_log]
        `);
        await queryRunner.query(`IF OBJECT_ID('integration_api_user_allowed_hotel', 'U') IS NOT NULL DROP TABLE [integration_api_user_allowed_hotel]`);
        await queryRunner.query(`IF OBJECT_ID('integration_api_usage_log', 'U') IS NOT NULL DROP TABLE [integration_api_usage_log]`);
        await queryRunner.query(`IF OBJECT_ID('integration_endpoint', 'U') IS NOT NULL DROP TABLE [integration_endpoint]`);
        await queryRunner.query(`IF OBJECT_ID('integration_api_key', 'U') IS NOT NULL DROP TABLE [integration_api_key]`);
        await queryRunner.query(`IF OBJECT_ID('integration_api_user', 'U') IS NOT NULL DROP TABLE [integration_api_user]`);
    }
}
