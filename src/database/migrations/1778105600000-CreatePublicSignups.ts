import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePublicSignups1778105600000 implements MigrationInterface {
    name = 'CreatePublicSignups1778105600000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('public_signup', 'U') IS NULL
            CREATE TABLE [public_signup] (
                [id] int IDENTITY(1,1) NOT NULL,
                [companyName] nvarchar(255) NOT NULL,
                [adminFullName] nvarchar(255) NOT NULL,
                [adminEmail] nvarchar(255) NOT NULL,
                [phone] nvarchar(50) NULL,
                [planId] int NOT NULL,
                [stripeCheckoutSessionId] nvarchar(255) NULL,
                [stripeCustomerId] nvarchar(255) NULL,
                [status] varchar(30) NOT NULL CONSTRAINT [DF_public_signup_status] DEFAULT 'PENDING_PAYMENT',
                [tenantId] int NULL,
                [adminUserId] int NULL,
                [createdAt] datetime2 NOT NULL CONSTRAINT [DF_public_signup_createdAt] DEFAULT SYSUTCDATETIME(),
                [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_public_signup_updatedAt] DEFAULT SYSUTCDATETIME(),
                CONSTRAINT [PK_public_signup] PRIMARY KEY ([id]),
                CONSTRAINT [FK_public_signup_plan] FOREIGN KEY ([planId]) REFERENCES [saas_plan]([id]) ON DELETE NO ACTION,
                CONSTRAINT [FK_public_signup_tenant] FOREIGN KEY ([tenantId]) REFERENCES [tenant]([id]) ON DELETE NO ACTION,
                CONSTRAINT [FK_public_signup_admin_user] FOREIGN KEY ([adminUserId]) REFERENCES [user]([id]) ON DELETE NO ACTION
            )
        `);

        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_public_signup_adminEmail')
                CREATE INDEX [IDX_public_signup_adminEmail] ON [public_signup] ([adminEmail])
        `);
        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_public_signup_checkoutSession')
                CREATE INDEX [IDX_public_signup_checkoutSession] ON [public_signup] ([stripeCheckoutSessionId])
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_public_signup_checkoutSession') DROP INDEX [IDX_public_signup_checkoutSession] ON [public_signup]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_public_signup_adminEmail') DROP INDEX [IDX_public_signup_adminEmail] ON [public_signup]`);
        await queryRunner.query(`IF OBJECT_ID('public_signup', 'U') IS NOT NULL DROP TABLE [public_signup]`);
    }
}
