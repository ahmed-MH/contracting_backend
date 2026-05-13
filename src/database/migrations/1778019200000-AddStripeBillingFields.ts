import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStripeBillingFields1778019200000 implements MigrationInterface {
    name = 'AddStripeBillingFields1778019200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF COL_LENGTH('saas_plan', 'stripeProductId') IS NULL
                ALTER TABLE [saas_plan] ADD [stripeProductId] nvarchar(255) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('saas_plan', 'stripePriceId') IS NULL
                ALTER TABLE [saas_plan] ADD [stripePriceId] nvarchar(255) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('tenant', 'stripeCustomerId') IS NULL
                ALTER TABLE [tenant] ADD [stripeCustomerId] nvarchar(255) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('saas_subscription', 'stripeSubscriptionId') IS NULL
                ALTER TABLE [saas_subscription] ADD [stripeSubscriptionId] nvarchar(255) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('saas_subscription', 'stripeCheckoutSessionId') IS NULL
                ALTER TABLE [saas_subscription] ADD [stripeCheckoutSessionId] nvarchar(255) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('saas_subscription', 'stripeCurrentPeriodEnd') IS NULL
                ALTER TABLE [saas_subscription] ADD [stripeCurrentPeriodEnd] datetime2 NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`IF COL_LENGTH('saas_subscription', 'stripeCurrentPeriodEnd') IS NOT NULL ALTER TABLE [saas_subscription] DROP COLUMN [stripeCurrentPeriodEnd]`);
        await queryRunner.query(`IF COL_LENGTH('saas_subscription', 'stripeCheckoutSessionId') IS NOT NULL ALTER TABLE [saas_subscription] DROP COLUMN [stripeCheckoutSessionId]`);
        await queryRunner.query(`IF COL_LENGTH('saas_subscription', 'stripeSubscriptionId') IS NOT NULL ALTER TABLE [saas_subscription] DROP COLUMN [stripeSubscriptionId]`);
        await queryRunner.query(`IF COL_LENGTH('tenant', 'stripeCustomerId') IS NOT NULL ALTER TABLE [tenant] DROP COLUMN [stripeCustomerId]`);
        await queryRunner.query(`IF COL_LENGTH('saas_plan', 'stripePriceId') IS NOT NULL ALTER TABLE [saas_plan] DROP COLUMN [stripePriceId]`);
        await queryRunner.query(`IF COL_LENGTH('saas_plan', 'stripeProductId') IS NOT NULL ALTER TABLE [saas_plan] DROP COLUMN [stripeProductId]`);
    }
}
