import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAffiliateEmailSpo1777075200000 implements MigrationInterface {
    name = 'CreateAffiliateEmailSpo1777075200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('affiliate_email_spo', 'U') IS NULL
            BEGIN
                CREATE TABLE [affiliate_email_spo] (
                    [id] int IDENTITY(1,1) NOT NULL,
                    [hotelId] int NOT NULL,
                    [affiliateId] int NOT NULL,
                    [name] nvarchar(255) NOT NULL,
                    [description] nvarchar(MAX) NULL,
                    [discountPercent] decimal(5,2) NOT NULL,
                    [applicationFrom] date NOT NULL,
                    [applicationTo] date NOT NULL,
                    [stackMode] nvarchar(50) NOT NULL CONSTRAINT [DF_affiliate_email_spo_stackMode] DEFAULT 'ROLLING',
                    [applicationStep] nvarchar(50) NOT NULL CONSTRAINT [DF_affiliate_email_spo_applicationStep] DEFAULT 'AFTER_CONTRACT_SPO',
                    [status] nvarchar(50) NOT NULL CONSTRAINT [DF_affiliate_email_spo_status] DEFAULT 'ACTIVE',
                    [createdAt] datetime2 NOT NULL CONSTRAINT [DF_affiliate_email_spo_createdAt] DEFAULT SYSUTCDATETIME(),
                    [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_affiliate_email_spo_updatedAt] DEFAULT SYSUTCDATETIME(),
                    [createdByUserId] int NULL,
                    [createdByName] nvarchar(255) NULL,
                    [createdByEmail] nvarchar(255) NULL,
                    [updatedByUserId] int NULL,
                    [updatedByName] nvarchar(255) NULL,
                    [updatedByEmail] nvarchar(255) NULL,
                    CONSTRAINT [PK_affiliate_email_spo] PRIMARY KEY ([id]),
                    CONSTRAINT [FK_affiliate_email_spo_hotel] FOREIGN KEY ([hotelId]) REFERENCES [hotel]([id]) ON DELETE CASCADE,
                    CONSTRAINT [FK_affiliate_email_spo_affiliate] FOREIGN KEY ([affiliateId]) REFERENCES [affiliate]([id]) ON DELETE NO ACTION
                )
            END
        `);

        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_affiliate_email_spo_hotel_affiliate')
                CREATE INDEX [IDX_affiliate_email_spo_hotel_affiliate] ON [affiliate_email_spo] ([hotelId], [affiliateId])
        `);

        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_affiliate_email_spo_affiliate_status_dates')
                CREATE INDEX [IDX_affiliate_email_spo_affiliate_status_dates]
                ON [affiliate_email_spo] ([affiliateId], [status], [applicationFrom], [applicationTo])
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_affiliate_email_spo_affiliate_status_dates')
                DROP INDEX [IDX_affiliate_email_spo_affiliate_status_dates] ON [affiliate_email_spo]
        `);
        await queryRunner.query(`
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_affiliate_email_spo_hotel_affiliate')
                DROP INDEX [IDX_affiliate_email_spo_hotel_affiliate] ON [affiliate_email_spo]
        `);
        await queryRunner.query(`IF OBJECT_ID('affiliate_email_spo', 'U') IS NOT NULL DROP TABLE [affiliate_email_spo]`);
    }
}
