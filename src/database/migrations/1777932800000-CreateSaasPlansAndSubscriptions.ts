import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSaasPlansAndSubscriptions1777932800000 implements MigrationInterface {
    name = 'CreateSaasPlansAndSubscriptions1777932800000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('saas_plan', 'U') IS NULL
            CREATE TABLE [saas_plan] (
                [id] int IDENTITY(1,1) NOT NULL,
                [name] nvarchar(255) NOT NULL,
                [description] nvarchar(1000) NOT NULL,
                [monthlyPrice] decimal(12,2) NOT NULL CONSTRAINT [DF_saas_plan_monthlyPrice] DEFAULT 0,
                [currency] nvarchar(3) NOT NULL CONSTRAINT [DF_saas_plan_currency] DEFAULT 'USD',
                [maxHotels] int NOT NULL,
                [maxUsers] int NOT NULL,
                [apiAccess] bit NOT NULL CONSTRAINT [DF_saas_plan_apiAccess] DEFAULT 0,
                [supportTier] nvarchar(100) NOT NULL,
                [features] nvarchar(MAX) NOT NULL CONSTRAINT [DF_saas_plan_features] DEFAULT '[]',
                [isActive] bit NOT NULL CONSTRAINT [DF_saas_plan_isActive] DEFAULT 1,
                [createdAt] datetime2 NOT NULL CONSTRAINT [DF_saas_plan_createdAt] DEFAULT SYSUTCDATETIME(),
                [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_saas_plan_updatedAt] DEFAULT SYSUTCDATETIME(),
                CONSTRAINT [PK_saas_plan] PRIMARY KEY ([id]),
                CONSTRAINT [UQ_saas_plan_name] UNIQUE ([name])
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('saas_subscription', 'U') IS NULL
            CREATE TABLE [saas_subscription] (
                [id] int IDENTITY(1,1) NOT NULL,
                [tenantId] int NOT NULL,
                [planId] int NOT NULL,
                [status] varchar(20) NOT NULL CONSTRAINT [DF_saas_subscription_status] DEFAULT 'ACTIVE',
                [currentPeriodStart] date NULL,
                [currentPeriodEnd] date NULL,
                [monthlyPrice] decimal(12,2) NOT NULL CONSTRAINT [DF_saas_subscription_monthlyPrice] DEFAULT 0,
                [currency] nvarchar(3) NOT NULL CONSTRAINT [DF_saas_subscription_currency] DEFAULT 'USD',
                [note] nvarchar(1000) NULL,
                [createdAt] datetime2 NOT NULL CONSTRAINT [DF_saas_subscription_createdAt] DEFAULT SYSUTCDATETIME(),
                [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_saas_subscription_updatedAt] DEFAULT SYSUTCDATETIME(),
                CONSTRAINT [PK_saas_subscription] PRIMARY KEY ([id]),
                CONSTRAINT [FK_saas_subscription_tenant] FOREIGN KEY ([tenantId]) REFERENCES [tenant]([id]) ON DELETE CASCADE,
                CONSTRAINT [FK_saas_subscription_plan] FOREIGN KEY ([planId]) REFERENCES [saas_plan]([id]) ON DELETE NO ACTION
            )
        `);

        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_saas_subscription_tenant_unique')
                CREATE UNIQUE INDEX [IDX_saas_subscription_tenant_unique]
                ON [saas_subscription] ([tenantId])
        `);

        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM [saas_plan] WHERE [name] = 'Free')
                INSERT INTO [saas_plan] ([name], [description], [monthlyPrice], [currency], [maxHotels], [maxUsers], [apiAccess], [supportTier], [features], [isActive])
                VALUES ('Free', 'Entry plan for new organizations validating platform fit.', 0, 'USD', 1, 5, 0, 'Community', '["1 hotel","5 users","Community support"]', 1)
        `);

        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM [saas_plan] WHERE [name] = 'Pro')
                INSERT INTO [saas_plan] ([name], [description], [monthlyPrice], [currency], [maxHotels], [maxUsers], [apiAccess], [supportTier], [features], [isActive])
                VALUES ('Pro', 'Growth tier with multi-property scale and API access.', 499, 'USD', 10, 50, 1, 'Priority', '["10 hotels","50 users","API access","Priority support"]', 1)
        `);

        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM [saas_plan] WHERE [name] = 'Enterprise')
                INSERT INTO [saas_plan] ([name], [description], [monthlyPrice], [currency], [maxHotels], [maxUsers], [apiAccess], [supportTier], [features], [isActive])
                VALUES ('Enterprise', 'Unlimited scale with dedicated enablement and governance.', 0, 'USD', 9999, 9999, 1, 'Dedicated', '["Unlimited hotels","Unlimited users","Dedicated API throughput","Success manager"]', 1)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_saas_subscription_tenant_unique')
                DROP INDEX [IDX_saas_subscription_tenant_unique] ON [saas_subscription]
        `);
        await queryRunner.query(`IF OBJECT_ID('saas_subscription', 'U') IS NOT NULL DROP TABLE [saas_subscription]`);
        await queryRunner.query(`IF OBJECT_ID('saas_plan', 'U') IS NOT NULL DROP TABLE [saas_plan]`);
    }
}
