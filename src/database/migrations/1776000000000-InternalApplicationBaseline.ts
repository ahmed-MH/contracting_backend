import { MigrationInterface, QueryRunner } from 'typeorm';

export class InternalApplicationBaseline1776000000000 implements MigrationInterface {
    name = 'InternalApplicationBaseline1776000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('tenant', 'U') IS NULL
            CREATE TABLE [tenant] (
                [id] int IDENTITY(1,1) NOT NULL,
                [name] nvarchar(255) NOT NULL,
                [isActive] bit NOT NULL CONSTRAINT [DF_tenant_isActive] DEFAULT 1,
                [createdAt] datetime2 NOT NULL CONSTRAINT [DF_tenant_createdAt] DEFAULT SYSUTCDATETIME(),
                [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_tenant_updatedAt] DEFAULT SYSUTCDATETIME(),
                CONSTRAINT [PK_tenant] PRIMARY KEY ([id])
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('[user]', 'U') IS NULL
            CREATE TABLE [user] (
                [id] int IDENTITY(1,1) NOT NULL,
                [email] nvarchar(255) NOT NULL,
                [firstName] nvarchar(255) NULL,
                [lastName] nvarchar(255) NULL,
                [password] nvarchar(255) NULL,
                [role] nvarchar(255) NOT NULL,
                [isActive] bit NOT NULL CONSTRAINT [DF_user_isActive] DEFAULT 0,
                [invitationToken] nvarchar(255) NULL,
                [resetPasswordToken] nvarchar(255) NULL,
                [tenantId] int NULL,
                [deletedAt] datetime2 NULL,
                CONSTRAINT [PK_user] PRIMARY KEY ([id]),
                CONSTRAINT [UQ_user_email] UNIQUE ([email]),
                CONSTRAINT [FK_user_tenant] FOREIGN KEY ([tenantId]) REFERENCES [tenant]([id]) ON DELETE NO ACTION
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('hotel', 'U') IS NULL
            CREATE TABLE [hotel] (
                [id] int IDENTITY(1,1) NOT NULL,
                [name] nvarchar(255) NOT NULL,
                [reference] varchar(50) NULL,
                [address] nvarchar(500) NULL,
                [city] nvarchar(255) NULL,
                [country] nvarchar(255) NULL,
                [phone] nvarchar(100) NULL,
                [email] nvarchar(255) NULL,
                [logoUrl] nvarchar(MAX) NULL,
                [preferredThemeColor] varchar(7) NULL,
                [stars] int NULL,
                [fax] nvarchar(255) NULL,
                [emails] nvarchar(MAX) NULL,
                [legalRepresentative] nvarchar(255) NULL,
                [fiscalName] nvarchar(255) NULL,
                [vatNumber] nvarchar(255) NULL,
                [defaultCurrency] varchar(3) NOT NULL CONSTRAINT [DF_hotel_defaultCurrency] DEFAULT 'TND',
                [bankName] nvarchar(255) NULL,
                [accountNumber] nvarchar(255) NULL,
                [ibanCode] nvarchar(255) NULL,
                [swiftCode] nvarchar(255) NULL,
                [tenantId] int NULL,
                [createdAt] datetime2 NOT NULL CONSTRAINT [DF_hotel_createdAt] DEFAULT SYSUTCDATETIME(),
                [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_hotel_updatedAt] DEFAULT SYSUTCDATETIME(),
                [createdByUserId] int NULL,
                [createdByName] nvarchar(255) NULL,
                [createdByEmail] nvarchar(255) NULL,
                [updatedByUserId] int NULL,
                [updatedByName] nvarchar(255) NULL,
                [updatedByEmail] nvarchar(255) NULL,
                [deletedAt] datetime2 NULL,
                CONSTRAINT [PK_hotel] PRIMARY KEY ([id]),
                CONSTRAINT [UQ_hotel_reference] UNIQUE ([reference]),
                CONSTRAINT [FK_hotel_tenant] FOREIGN KEY ([tenantId]) REFERENCES [tenant]([id]) ON DELETE NO ACTION
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('user_hotels', 'U') IS NULL
            CREATE TABLE [user_hotels] (
                [userId] int NOT NULL,
                [hotelId] int NOT NULL,
                CONSTRAINT [PK_user_hotels] PRIMARY KEY ([userId], [hotelId]),
                CONSTRAINT [FK_user_hotels_user] FOREIGN KEY ([userId]) REFERENCES [user]([id]) ON DELETE CASCADE,
                CONSTRAINT [FK_user_hotels_hotel] FOREIGN KEY ([hotelId]) REFERENCES [hotel]([id]) ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`IF OBJECT_ID('user_hotels', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_user_hotels_userId' AND [object_id] = OBJECT_ID('user_hotels')) CREATE INDEX [IDX_user_hotels_userId] ON [user_hotels] ([userId])`);
        await queryRunner.query(`IF OBJECT_ID('user_hotels', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_user_hotels_hotelId' AND [object_id] = OBJECT_ID('user_hotels')) CREATE INDEX [IDX_user_hotels_hotelId] ON [user_hotels] ([hotelId])`);

        await queryRunner.query(`
            IF OBJECT_ID('room_type', 'U') IS NULL
            CREATE TABLE [room_type] (
                [id] int IDENTITY(1,1) NOT NULL,
                [hotelId] int NOT NULL,
                [name] nvarchar(255) NOT NULL,
                [code] nvarchar(100) NULL,
                [capacity] int NULL,
                [deletedAt] datetime2 NULL,
                CONSTRAINT [PK_room_type] PRIMARY KEY ([id]),
                CONSTRAINT [FK_room_type_hotel] FOREIGN KEY ([hotelId]) REFERENCES [hotel]([id]) ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('arrangement', 'U') IS NULL
            CREATE TABLE [arrangement] (
                [id] int IDENTITY(1,1) NOT NULL,
                [hotelId] int NOT NULL,
                [name] nvarchar(255) NOT NULL,
                [code] nvarchar(100) NULL,
                [description] nvarchar(MAX) NULL,
                [deletedAt] datetime2 NULL,
                CONSTRAINT [PK_arrangement] PRIMARY KEY ([id]),
                CONSTRAINT [FK_arrangement_hotel] FOREIGN KEY ([hotelId]) REFERENCES [hotel]([id]) ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('affiliate', 'U') IS NULL
            CREATE TABLE [affiliate] (
                [id] int IDENTITY(1,1) NOT NULL,
                [companyName] nvarchar(255) NOT NULL,
                [contactName] nvarchar(255) NULL,
                [email] nvarchar(255) NULL,
                [phone] nvarchar(100) NULL,
                [type] nvarchar(100) NULL,
                [tenantId] int NULL,
                [deletedAt] datetime2 NULL,
                CONSTRAINT [PK_affiliate] PRIMARY KEY ([id]),
                CONSTRAINT [FK_affiliate_tenant] FOREIGN KEY ([tenantId]) REFERENCES [tenant]([id]) ON DELETE NO ACTION
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('contract', 'U') IS NULL
            CREATE TABLE [contract] (
                [id] int IDENTITY(1,1) NOT NULL,
                [reference] varchar(50) NULL,
                [name] nvarchar(255) NOT NULL,
                [startDate] date NOT NULL,
                [endDate] date NOT NULL,
                [currency] nvarchar(255) NOT NULL,
                [status] nvarchar(255) NOT NULL CONSTRAINT [DF_contract_status] DEFAULT 'DRAFT',
                [paymentCondition] nvarchar(255) NULL,
                [depositAmount] decimal(10,2) NULL,
                [creditDays] int NULL,
                [paymentMethods] nvarchar(MAX) NULL,
                [hotelId] int NOT NULL,
                [baseArrangementId] int NULL,
                [deletedAt] datetime2 NULL,
                CONSTRAINT [PK_contract] PRIMARY KEY ([id]),
                CONSTRAINT [FK_contract_hotel] FOREIGN KEY ([hotelId]) REFERENCES [hotel]([id]) ON DELETE CASCADE,
                CONSTRAINT [FK_contract_base_arrangement] FOREIGN KEY ([baseArrangementId]) REFERENCES [arrangement]([id]) ON DELETE NO ACTION
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('contract_affiliates', 'U') IS NULL
            CREATE TABLE [contract_affiliates] (
                [contractId] int NOT NULL,
                [affiliateId] int NOT NULL,
                CONSTRAINT [PK_contract_affiliates] PRIMARY KEY ([contractId], [affiliateId]),
                CONSTRAINT [FK_contract_affiliates_contract] FOREIGN KEY ([contractId]) REFERENCES [contract]([id]) ON DELETE CASCADE,
                CONSTRAINT [FK_contract_affiliates_affiliate] FOREIGN KEY ([affiliateId]) REFERENCES [affiliate]([id]) ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('period', 'U') IS NULL
            CREATE TABLE [period] (
                [id] int IDENTITY(1,1) NOT NULL,
                [contractId] int NOT NULL,
                [name] nvarchar(255) NULL,
                [startDate] date NOT NULL,
                [endDate] date NOT NULL,
                CONSTRAINT [PK_period] PRIMARY KEY ([id]),
                CONSTRAINT [FK_period_contract] FOREIGN KEY ([contractId]) REFERENCES [contract]([id]) ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('contract_room', 'U') IS NULL
            CREATE TABLE [contract_room] (
                [id] int IDENTITY(1,1) NOT NULL,
                [contractId] int NOT NULL,
                [roomTypeId] int NOT NULL,
                [baseRateType] nvarchar(255) NULL,
                CONSTRAINT [PK_contract_room] PRIMARY KEY ([id]),
                CONSTRAINT [FK_contract_room_contract] FOREIGN KEY ([contractId]) REFERENCES [contract]([id]) ON DELETE CASCADE,
                CONSTRAINT [FK_contract_room_room_type] FOREIGN KEY ([roomTypeId]) REFERENCES [room_type]([id]) ON DELETE NO ACTION
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('contract_line', 'U') IS NULL
            CREATE TABLE [contract_line] (
                [id] int IDENTITY(1,1) NOT NULL,
                [contractId] int NOT NULL,
                [periodId] int NULL,
                [roomTypeId] int NULL,
                [arrangementId] int NULL,
                CONSTRAINT [PK_contract_line] PRIMARY KEY ([id]),
                CONSTRAINT [FK_contract_line_contract] FOREIGN KEY ([contractId]) REFERENCES [contract]([id]) ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('contract_rates', 'U') IS NULL
            CREATE TABLE [contract_rates] (
                [id] int IDENTITY(1,1) NOT NULL,
                [periodId] int NOT NULL,
                [contractRoomId] int NOT NULL,
                [arrangementId] int NULL,
                [amount] decimal(18,2) NOT NULL CONSTRAINT [DF_contract_rates_amount] DEFAULT 0,
                CONSTRAINT [PK_contract_rates] PRIMARY KEY ([id]),
                CONSTRAINT [FK_contract_rates_period] FOREIGN KEY ([periodId]) REFERENCES [period]([id]) ON DELETE CASCADE,
                CONSTRAINT [FK_contract_rates_contract_room] FOREIGN KEY ([contractRoomId]) REFERENCES [contract_room]([id]) ON DELETE NO ACTION
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('allotment', 'U') IS NULL
            CREATE TABLE [allotment] (
                [id] int IDENTITY(1,1) NOT NULL,
                [periodId] int NOT NULL,
                [contractRoomId] int NOT NULL,
                [allotment] int NOT NULL CONSTRAINT [DF_allotment_allotment] DEFAULT 0,
                [releaseDays] int NOT NULL CONSTRAINT [DF_allotment_releaseDays] DEFAULT 0,
                CONSTRAINT [PK_allotment] PRIMARY KEY ([id])
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('promotion', 'U') IS NULL
            CREATE TABLE [promotion] (
                [id] int IDENTITY(1,1) NOT NULL,
                [contractId] int NOT NULL,
                [name] nvarchar(255) NOT NULL,
                CONSTRAINT [PK_promotion] PRIMARY KEY ([id])
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('child_policy', 'U') IS NULL
            CREATE TABLE [child_policy] (
                [id] int IDENTITY(1,1) NOT NULL,
                [contractId] int NOT NULL,
                [name] nvarchar(255) NULL,
                CONSTRAINT [PK_child_policy] PRIMARY KEY ([id])
            )
        `);

        await this.createTemplateTable(queryRunner, 'template_supplement');
        await this.createTemplateTable(queryRunner, 'template_reduction');
        await this.createTemplateTable(queryRunner, 'template_monoparental_rule');
        await this.createTemplateTable(queryRunner, 'template_early_booking');
        await this.createTemplateTable(queryRunner, 'template_spo');
        await this.createTemplateTable(queryRunner, 'template_cancellation_rule');

        await queryRunner.query(`
            IF OBJECT_ID('exchange_rate', 'U') IS NULL
            CREATE TABLE [exchange_rate] (
                [id] int IDENTITY(1,1) NOT NULL,
                [hotelId] int NOT NULL,
                [currency] nvarchar(3) NULL,
                [rate] decimal(18,8) NOT NULL,
                [validFrom] date NULL,
                [validUntil] date NULL,
                CONSTRAINT [PK_exchange_rate] PRIMARY KEY ([id]),
                CONSTRAINT [FK_exchange_rate_hotel] FOREIGN KEY ([hotelId]) REFERENCES [hotel]([id]) ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('proforma_invoice', 'U') IS NULL
            CREATE TABLE [proforma_invoice] (
                [id] int IDENTITY(1,1) NOT NULL,
                [hotelId] int NOT NULL,
                [affiliateId] int NULL,
                [contractId] int NULL,
                [generatedByUserId] int NULL,
                [reference] varchar(50) NOT NULL,
                [status] nvarchar(255) NOT NULL CONSTRAINT [DF_proforma_invoice_status] DEFAULT 'DRAFT',
                [currency] varchar(10) NOT NULL,
                [customerName] varchar(255) NOT NULL,
                [customerEmail] varchar(255) NULL,
                [checkIn] date NOT NULL,
                [checkOut] date NOT NULL,
                [bookingDate] date NOT NULL,
                [boardTypeName] varchar(100) NOT NULL,
                [roomingSummary] nvarchar(MAX) NOT NULL,
                [simulationInputSnapshot] nvarchar(MAX) NOT NULL,
                [calculationSnapshot] nvarchar(MAX) NOT NULL,
                [totalsSnapshot] nvarchar(MAX) NOT NULL,
                [notes] nvarchar(MAX) NULL,
                [generatedAt] datetime NOT NULL,
                [deletedAt] datetime2 NULL,
                CONSTRAINT [PK_proforma_invoice] PRIMARY KEY ([id]),
                CONSTRAINT [UQ_proforma_invoice_reference] UNIQUE ([reference])
            )
        `);

        await queryRunner.query(`
            IF OBJECT_ID('audit_log', 'U') IS NULL
            CREATE TABLE [audit_log] (
                [id] int IDENTITY(1,1) NOT NULL,
                [action] nvarchar(255) NOT NULL,
                [entity] nvarchar(255) NULL,
                [entityId] int NULL,
                [userId] int NULL,
                [createdAt] datetime2 NOT NULL CONSTRAINT [DF_audit_log_createdAt] DEFAULT SYSUTCDATETIME(),
                CONSTRAINT [PK_audit_log] PRIMARY KEY ([id])
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`IF OBJECT_ID('audit_log', 'U') IS NOT NULL DROP TABLE [audit_log]`);
        await queryRunner.query(`IF OBJECT_ID('proforma_invoice', 'U') IS NOT NULL DROP TABLE [proforma_invoice]`);
        await queryRunner.query(`IF OBJECT_ID('exchange_rate', 'U') IS NOT NULL DROP TABLE [exchange_rate]`);

        for (const table of [
            'template_cancellation_rule',
            'template_spo',
            'template_early_booking',
            'template_monoparental_rule',
            'template_reduction',
            'template_supplement',
            'child_policy',
            'promotion',
            'allotment',
            'contract_rates',
            'contract_line',
            'contract_room',
            'period',
            'contract_affiliates',
            'contract',
            'affiliate',
            'arrangement',
            'room_type',
            'user_hotels',
            'hotel',
            'user',
            'tenant',
        ]) {
            await queryRunner.query(`IF OBJECT_ID('${table}', 'U') IS NOT NULL DROP TABLE [${table}]`);
        }
    }

    private async createTemplateTable(queryRunner: QueryRunner, table: string): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('${table}', 'U') IS NULL
            CREATE TABLE [${table}] (
                [id] int IDENTITY(1,1) NOT NULL,
                [hotelId] int NOT NULL,
                [name] nvarchar(255) NOT NULL,
                [description] nvarchar(MAX) NULL,
                [deletedAt] datetime2 NULL,
                CONSTRAINT [PK_${table}] PRIMARY KEY ([id]),
                CONSTRAINT [FK_${table}_hotel] FOREIGN KEY ([hotelId]) REFERENCES [hotel]([id]) ON DELETE CASCADE
            )
        `);
    }
}
