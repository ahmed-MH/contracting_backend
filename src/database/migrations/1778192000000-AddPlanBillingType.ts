import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanBillingType1778192000000 implements MigrationInterface {
    name = 'AddPlanBillingType1778192000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF COL_LENGTH('saas_plan', 'billingType') IS NULL
                ALTER TABLE [saas_plan] ADD [billingType] varchar(20) NOT NULL CONSTRAINT [DF_saas_plan_billingType] DEFAULT 'RECURRING'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF EXISTS (
                SELECT 1
                FROM sys.default_constraints
                WHERE [name] = 'DF_saas_plan_billingType'
            )
                ALTER TABLE [saas_plan] DROP CONSTRAINT [DF_saas_plan_billingType]
        `);
        await queryRunner.query(`IF COL_LENGTH('saas_plan', 'billingType') IS NOT NULL ALTER TABLE [saas_plan] DROP COLUMN [billingType]`);
    }
}
