import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenBillingIdempotency1778278400000 implements MigrationInterface {
    name = 'HardenBillingIdempotency1778278400000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF COL_LENGTH('public_signup', 'subscriptionId') IS NULL
                ALTER TABLE [public_signup] ADD [subscriptionId] int NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('public_signup', 'completedAt') IS NULL
                ALTER TABLE [public_signup] ADD [completedAt] datetime2 NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('public_signup', 'lastStripeEventId') IS NULL
                ALTER TABLE [public_signup] ADD [lastStripeEventId] nvarchar(255) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('public_signup', 'failureReason') IS NULL
                ALTER TABLE [public_signup] ADD [failureReason] nvarchar(1000) NULL
        `);
        await queryRunner.query(`
            IF NOT EXISTS (
                SELECT 1
                FROM sys.foreign_keys
                WHERE [name] = 'FK_public_signup_subscription'
            )
                ALTER TABLE [public_signup]
                ADD CONSTRAINT [FK_public_signup_subscription]
                FOREIGN KEY ([subscriptionId]) REFERENCES [saas_subscription]([id]) ON DELETE NO ACTION
        `);

        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_public_signup_status')
                CREATE INDEX [IDX_public_signup_status] ON [public_signup] ([status])
        `);
        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_public_signup_createdAt')
                CREATE INDEX [IDX_public_signup_createdAt] ON [public_signup] ([createdAt])
        `);
        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_public_signup_lastStripeEventId')
                CREATE INDEX [IDX_public_signup_lastStripeEventId] ON [public_signup] ([lastStripeEventId])
        `);
        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'UQ_public_signup_checkoutSession_not_null')
                CREATE UNIQUE INDEX [UQ_public_signup_checkoutSession_not_null]
                ON [public_signup] ([stripeCheckoutSessionId])
                WHERE [stripeCheckoutSessionId] IS NOT NULL
        `);
        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'UQ_saas_subscription_checkoutSession_not_null')
                CREATE UNIQUE INDEX [UQ_saas_subscription_checkoutSession_not_null]
                ON [saas_subscription] ([stripeCheckoutSessionId])
                WHERE [stripeCheckoutSessionId] IS NOT NULL
        `);
        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'UQ_saas_subscription_stripeSubscription_not_null')
                CREATE UNIQUE INDEX [UQ_saas_subscription_stripeSubscription_not_null]
                ON [saas_subscription] ([stripeSubscriptionId])
                WHERE [stripeSubscriptionId] IS NOT NULL
        `);
        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_saas_subscription_planId')
                CREATE INDEX [IDX_saas_subscription_planId] ON [saas_subscription] ([planId])
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_saas_subscription_planId') DROP INDEX [IDX_saas_subscription_planId] ON [saas_subscription]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'UQ_saas_subscription_stripeSubscription_not_null') DROP INDEX [UQ_saas_subscription_stripeSubscription_not_null] ON [saas_subscription]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'UQ_saas_subscription_checkoutSession_not_null') DROP INDEX [UQ_saas_subscription_checkoutSession_not_null] ON [saas_subscription]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'UQ_public_signup_checkoutSession_not_null') DROP INDEX [UQ_public_signup_checkoutSession_not_null] ON [public_signup]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_public_signup_lastStripeEventId') DROP INDEX [IDX_public_signup_lastStripeEventId] ON [public_signup]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_public_signup_createdAt') DROP INDEX [IDX_public_signup_createdAt] ON [public_signup]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_public_signup_status') DROP INDEX [IDX_public_signup_status] ON [public_signup]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = 'FK_public_signup_subscription') ALTER TABLE [public_signup] DROP CONSTRAINT [FK_public_signup_subscription]`);
        await queryRunner.query(`IF COL_LENGTH('public_signup', 'failureReason') IS NOT NULL ALTER TABLE [public_signup] DROP COLUMN [failureReason]`);
        await queryRunner.query(`IF COL_LENGTH('public_signup', 'lastStripeEventId') IS NOT NULL ALTER TABLE [public_signup] DROP COLUMN [lastStripeEventId]`);
        await queryRunner.query(`IF COL_LENGTH('public_signup', 'completedAt') IS NOT NULL ALTER TABLE [public_signup] DROP COLUMN [completedAt]`);
        await queryRunner.query(`IF COL_LENGTH('public_signup', 'subscriptionId') IS NOT NULL ALTER TABLE [public_signup] DROP COLUMN [subscriptionId]`);
    }
}
