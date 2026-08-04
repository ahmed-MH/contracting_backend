import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSaasSupervisorBilling1778537600000 implements MigrationInterface {
    name = 'RemoveSaasSupervisorBilling1778537600000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('tenant', 'U') IS NOT NULL
            BEGIN
                DECLARE @fallbackTenantId int;
                SELECT TOP 1 @fallbackTenantId = [id] FROM [tenant] WHERE [name] = 'Internal Pricify' ORDER BY [id];

                IF @fallbackTenantId IS NULL
                BEGIN
                    INSERT INTO [tenant] ([name], [isActive], [createdAt], [updatedAt])
                    VALUES ('Internal Pricify', 1, SYSUTCDATETIME(), SYSUTCDATETIME());
                    SET @fallbackTenantId = SCOPE_IDENTITY();
                END

                IF OBJECT_ID('user', 'U') IS NOT NULL
                BEGIN
                    UPDATE [user]
                    SET [role] = 'ADMIN',
                        [isActive] = 0,
                        [deletedAt] = COALESCE([deletedAt], SYSUTCDATETIME()),
                        [tenantId] = COALESCE([tenantId], @fallbackTenantId)
                    WHERE [role] = 'SUPERVISOR';
                END
            END
        `);

        await queryRunner.query(`
            IF OBJECT_ID('system_audit_log', 'U') IS NOT NULL
                DELETE FROM [system_audit_log]
                WHERE [category] IN ('PLAN', 'SUBSCRIPTION', 'BILLING', 'WEBHOOK', 'ENTITLEMENT')
        `);

        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = 'FK_public_signup_subscription') ALTER TABLE [public_signup] DROP CONSTRAINT [FK_public_signup_subscription]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = 'FK_public_signup_plan') ALTER TABLE [public_signup] DROP CONSTRAINT [FK_public_signup_plan]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = 'FK_public_signup_tenant') ALTER TABLE [public_signup] DROP CONSTRAINT [FK_public_signup_tenant]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = 'FK_public_signup_admin_user') ALTER TABLE [public_signup] DROP CONSTRAINT [FK_public_signup_admin_user]`);

        await queryRunner.query(`IF OBJECT_ID('public_signup', 'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_public_signup_lastStripeEventId' AND [object_id] = OBJECT_ID('public_signup')) DROP INDEX [IDX_public_signup_lastStripeEventId] ON [public_signup]`);
        await queryRunner.query(`IF OBJECT_ID('public_signup', 'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'UQ_public_signup_checkoutSession_not_null' AND [object_id] = OBJECT_ID('public_signup')) DROP INDEX [UQ_public_signup_checkoutSession_not_null] ON [public_signup]`);
        await queryRunner.query(`IF OBJECT_ID('public_signup', 'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_public_signup_checkoutSession' AND [object_id] = OBJECT_ID('public_signup')) DROP INDEX [IDX_public_signup_checkoutSession] ON [public_signup]`);
        await queryRunner.query(`IF OBJECT_ID('public_signup', 'U') IS NOT NULL DROP TABLE [public_signup]`);

        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = 'FK_saas_subscription_plan') ALTER TABLE [saas_subscription] DROP CONSTRAINT [FK_saas_subscription_plan]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = 'FK_saas_subscription_tenant') ALTER TABLE [saas_subscription] DROP CONSTRAINT [FK_saas_subscription_tenant]`);
        await queryRunner.query(`IF OBJECT_ID('saas_subscription', 'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_saas_subscription_planId' AND [object_id] = OBJECT_ID('saas_subscription')) DROP INDEX [IDX_saas_subscription_planId] ON [saas_subscription]`);
        await queryRunner.query(`IF OBJECT_ID('saas_subscription', 'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'UQ_saas_subscription_stripeSubscription_not_null' AND [object_id] = OBJECT_ID('saas_subscription')) DROP INDEX [UQ_saas_subscription_stripeSubscription_not_null] ON [saas_subscription]`);
        await queryRunner.query(`IF OBJECT_ID('saas_subscription', 'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'UQ_saas_subscription_checkoutSession_not_null' AND [object_id] = OBJECT_ID('saas_subscription')) DROP INDEX [UQ_saas_subscription_checkoutSession_not_null] ON [saas_subscription]`);
        await queryRunner.query(`IF OBJECT_ID('saas_subscription', 'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_saas_subscription_tenant_unique' AND [object_id] = OBJECT_ID('saas_subscription')) DROP INDEX [IDX_saas_subscription_tenant_unique] ON [saas_subscription]`);
        await queryRunner.query(`IF OBJECT_ID('saas_subscription', 'U') IS NOT NULL DROP TABLE [saas_subscription]`);
        await queryRunner.query(`IF OBJECT_ID('saas_plan', 'U') IS NOT NULL DROP TABLE [saas_plan]`);

        await queryRunner.query(`IF COL_LENGTH('tenant', 'stripeCustomerId') IS NOT NULL ALTER TABLE [tenant] DROP COLUMN [stripeCustomerId]`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`IF OBJECT_ID('tenant', 'U') IS NOT NULL AND COL_LENGTH('tenant', 'stripeCustomerId') IS NULL ALTER TABLE [tenant] ADD [stripeCustomerId] nvarchar(255) NULL`);

        await queryRunner.query(`
            IF OBJECT_ID('saas_plan', 'U') IS NULL
            CREATE TABLE [saas_plan] (
                [id] int IDENTITY(1,1) NOT NULL,
                [name] nvarchar(255) NOT NULL,
                [description] nvarchar(MAX) NOT NULL,
                [billingType] varchar(20) NOT NULL CONSTRAINT [DF_saas_plan_billingType] DEFAULT 'RECURRING',
                [monthlyPrice] decimal(12,2) NOT NULL CONSTRAINT [DF_saas_plan_monthlyPrice] DEFAULT 0,
                [currency] nvarchar(3) NOT NULL CONSTRAINT [DF_saas_plan_currency] DEFAULT 'USD',
                [maxHotels] int NOT NULL,
                [maxUsers] int NOT NULL,
                [apiAccess] bit NOT NULL CONSTRAINT [DF_saas_plan_apiAccess] DEFAULT 0,
                [supportTier] nvarchar(100) NOT NULL,
                [features] nvarchar(MAX) NOT NULL CONSTRAINT [DF_saas_plan_features] DEFAULT '[]',
                [stripeProductId] nvarchar(255) NULL,
                [stripePriceId] nvarchar(255) NULL,
                [isActive] bit NOT NULL CONSTRAINT [DF_saas_plan_isActive] DEFAULT 1,
                [createdAt] datetime2 NOT NULL CONSTRAINT [DF_saas_plan_createdAt] DEFAULT SYSUTCDATETIME(),
                [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_saas_plan_updatedAt] DEFAULT SYSUTCDATETIME(),
                CONSTRAINT [PK_saas_plan] PRIMARY KEY ([id]),
                CONSTRAINT [UQ_saas_plan_name] UNIQUE ([name])
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('tenant', 'U') IS NOT NULL AND OBJECT_ID('saas_plan', 'U') IS NOT NULL AND OBJECT_ID('saas_subscription', 'U') IS NULL
            CREATE TABLE [saas_subscription] (
                [id] int IDENTITY(1,1) NOT NULL,
                [tenantId] int NOT NULL,
                [planId] int NOT NULL,
                [status] varchar(20) NOT NULL CONSTRAINT [DF_saas_subscription_status] DEFAULT 'ACTIVE',
                [currentPeriodStart] date NULL,
                [currentPeriodEnd] date NULL,
                [monthlyPrice] decimal(12,2) NOT NULL CONSTRAINT [DF_saas_subscription_monthlyPrice] DEFAULT 0,
                [currency] nvarchar(3) NOT NULL CONSTRAINT [DF_saas_subscription_currency] DEFAULT 'USD',
                [note] nvarchar(MAX) NULL,
                [stripeSubscriptionId] nvarchar(255) NULL,
                [stripeCheckoutSessionId] nvarchar(255) NULL,
                [stripeCurrentPeriodEnd] datetime2 NULL,
                [createdAt] datetime2 NOT NULL CONSTRAINT [DF_saas_subscription_createdAt] DEFAULT SYSUTCDATETIME(),
                [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_saas_subscription_updatedAt] DEFAULT SYSUTCDATETIME(),
                CONSTRAINT [PK_saas_subscription] PRIMARY KEY ([id]),
                CONSTRAINT [FK_saas_subscription_tenant] FOREIGN KEY ([tenantId]) REFERENCES [tenant]([id]) ON DELETE CASCADE,
                CONSTRAINT [FK_saas_subscription_plan] FOREIGN KEY ([planId]) REFERENCES [saas_plan]([id]) ON DELETE NO ACTION
            )
        `);
    }
}
