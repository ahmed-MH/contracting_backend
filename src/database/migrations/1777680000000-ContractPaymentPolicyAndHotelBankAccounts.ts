import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContractPaymentPolicyAndHotelBankAccounts1777680000000 implements MigrationInterface {
    name = 'ContractPaymentPolicyAndHotelBankAccounts1777680000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('hotel_bank_account', 'U') IS NULL
            BEGIN
                CREATE TABLE [hotel_bank_account] (
                    [id] int IDENTITY(1,1) NOT NULL,
                    [hotelId] int NOT NULL,
                    [label] nvarchar(255) NOT NULL,
                    [bankName] nvarchar(255) NULL,
                    [accountNumber] nvarchar(255) NULL,
                    [rib] nvarchar(255) NULL,
                    [iban] nvarchar(255) NULL,
                    [swiftCode] nvarchar(255) NULL,
                    [currency] varchar(3) NULL,
                    [country] varchar(2) NULL,
                    [isDefault] bit NOT NULL CONSTRAINT [DF_hotel_bank_account_isDefault] DEFAULT 0,
                    [active] bit NOT NULL CONSTRAINT [DF_hotel_bank_account_active] DEFAULT 1,
                    [createdAt] datetime2 NOT NULL CONSTRAINT [DF_hotel_bank_account_createdAt] DEFAULT SYSUTCDATETIME(),
                    [updatedAt] datetime2 NOT NULL CONSTRAINT [DF_hotel_bank_account_updatedAt] DEFAULT SYSUTCDATETIME(),
                    [createdByUserId] int NULL,
                    [createdByName] nvarchar(255) NULL,
                    [createdByEmail] nvarchar(255) NULL,
                    [updatedByUserId] int NULL,
                    [updatedByName] nvarchar(255) NULL,
                    [updatedByEmail] nvarchar(255) NULL,
                    CONSTRAINT [PK_hotel_bank_account] PRIMARY KEY ([id]),
                    CONSTRAINT [FK_hotel_bank_account_hotel] FOREIGN KEY ([hotelId]) REFERENCES [hotel]([id]) ON DELETE CASCADE
                )
            END
        `);

        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_HOTEL_BANK_ACCOUNT_HOTEL_ACTIVE')
                CREATE INDEX [IDX_HOTEL_BANK_ACCOUNT_HOTEL_ACTIVE] ON [hotel_bank_account] ([hotelId], [active])
        `);

        await queryRunner.query(`
            IF COL_LENGTH('contract', 'paymentPolicy') IS NULL
                ALTER TABLE [contract] ADD [paymentPolicy] nvarchar(MAX) NULL
        `);

        await queryRunner.query(`
            IF COL_LENGTH('contract', 'selectedHotelBankAccountId') IS NULL
                ALTER TABLE [contract] ADD [selectedHotelBankAccountId] int NULL
        `);

        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = 'FK_contract_selected_hotel_bank_account')
                ALTER TABLE [contract]
                ADD CONSTRAINT [FK_contract_selected_hotel_bank_account]
                FOREIGN KEY ([selectedHotelBankAccountId]) REFERENCES [hotel_bank_account]([id]) ON DELETE NO ACTION
        `);

        await queryRunner.query(`
            INSERT INTO [hotel_bank_account] (
                [hotelId],
                [label],
                [bankName],
                [accountNumber],
                [rib],
                [iban],
                [swiftCode],
                [currency],
                [country],
                [isDefault],
                [active],
                [createdAt],
                [updatedAt],
                [createdByUserId],
                [createdByName],
                [createdByEmail],
                [updatedByUserId],
                [updatedByName],
                [updatedByEmail]
            )
            SELECT
                h.[id],
                'Default bank account',
                h.[bankName],
                h.[accountNumber],
                h.[accountNumber],
                h.[ibanCode],
                h.[swiftCode],
                h.[defaultCurrency],
                'TN',
                1,
                1,
                COALESCE(h.[createdAt], SYSUTCDATETIME()),
                COALESCE(h.[updatedAt], h.[createdAt], SYSUTCDATETIME()),
                h.[createdByUserId],
                h.[createdByName],
                h.[createdByEmail],
                h.[updatedByUserId],
                h.[updatedByName],
                h.[updatedByEmail]
            FROM [hotel] h
            WHERE NOT EXISTS (
                SELECT 1 FROM [hotel_bank_account] hba WHERE hba.[hotelId] = h.[id] AND hba.[isDefault] = 1
            )
            AND (
                NULLIF(LTRIM(RTRIM(COALESCE(h.[bankName], ''))), '') IS NOT NULL
                OR NULLIF(LTRIM(RTRIM(COALESCE(h.[accountNumber], ''))), '') IS NOT NULL
                OR NULLIF(LTRIM(RTRIM(COALESCE(h.[ibanCode], ''))), '') IS NOT NULL
                OR NULLIF(LTRIM(RTRIM(COALESCE(h.[swiftCode], ''))), '') IS NOT NULL
            )
        `);

        await queryRunner.query(`
            UPDATE c
            SET [selectedHotelBankAccountId] = hba.[id]
            FROM [contract] c
            INNER JOIN [hotel_bank_account] hba
                ON hba.[hotelId] = c.[hotelId]
                AND hba.[isDefault] = 1
                AND hba.[active] = 1
            WHERE c.[selectedHotelBankAccountId] IS NULL
        `);

        await queryRunner.query(`
            UPDATE c
            SET [paymentPolicy] = p.[json]
            FROM [contract] c
            LEFT JOIN [hotel] h ON h.[id] = c.[hotelId]
            CROSS APPLY (
                SELECT
                    CASE WHEN UPPER(COALESCE(c.[currency], '')) = 'TND' THEN 'NATIONAL' ELSE 'INTERNATIONAL' END AS [marketScope],
                    JSON_QUERY((
                        SELECT [type], [isPrimary]
                        FROM (
                            SELECT 'BANK_TRANSFER' AS [type], CAST(1 AS bit) AS [isPrimary]
                            WHERE c.[paymentMethods] LIKE '%BANK_TRANSFER%'
                            UNION ALL
                            SELECT 'BANK_CHECK' AS [type], CAST(CASE WHEN c.[paymentMethods] NOT LIKE '%BANK_TRANSFER%' THEN 1 ELSE 0 END AS bit) AS [isPrimary]
                            WHERE c.[paymentMethods] LIKE '%BANK_CHECK%'
                        ) methods
                        FOR JSON PATH
                    )) AS [methods],
                    JSON_QUERY((
                        SELECT [type], [percentage], [days], [basis]
                        FROM (
                            SELECT 'FULL_PREPAYMENT' AS [type], CAST(100 AS int) AS [percentage], CAST(NULL AS int) AS [days], CAST(NULL AS nvarchar(50)) AS [basis]
                            WHERE c.[paymentCondition] IN ('PREPAYMENT_100', 'FULL_PREPAYMENT')
                            UNION ALL
                            SELECT 'PARTIAL_DEPOSIT' AS [type], CAST(NULL AS int) AS [percentage], CAST(NULL AS int) AS [days], CAST(NULL AS nvarchar(50)) AS [basis]
                            WHERE c.[paymentCondition] IN ('DEPOSIT', 'PARTIAL_DEPOSIT') OR COALESCE(c.[depositAmount], 0) > 0
                            UNION ALL
                            SELECT 'CREDIT_DAYS_FROM_INVOICE' AS [type], CAST(NULL AS int) AS [percentage], c.[creditDays] AS [days], 'INVOICE_ISSUE' AS [basis]
                            WHERE COALESCE(c.[creditDays], 0) > 0
                        ) conditions
                        FOR JSON PATH
                    )) AS [conditions],
                    CASE WHEN COALESCE(c.[depositAmount], 0) > 0
                        THEN JSON_QUERY((
                            SELECT
                                'AMOUNT' AS [type],
                                c.[depositAmount] AS [value],
                                COALESCE(c.[currency], h.[defaultCurrency], 'TND') AS [currency],
                                'BOOKING_CONFIRMATION' AS [dueTrigger],
                                CAST(0 AS bit) AS [refundable]
                            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                        ))
                        ELSE NULL
                    END AS [deposit],
                    c.[selectedHotelBankAccountId],
                    CAST(NULL AS nvarchar(MAX)) AS [notes]
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            ) p([json])
            WHERE c.[paymentPolicy] IS NULL
            AND (
                c.[paymentCondition] IS NOT NULL
                OR COALESCE(c.[depositAmount], 0) > 0
                OR COALESCE(c.[creditDays], 0) > 0
                OR NULLIF(LTRIM(RTRIM(COALESCE(c.[paymentMethods], ''))), '') IS NOT NULL
                OR c.[selectedHotelBankAccountId] IS NOT NULL
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = 'FK_contract_selected_hotel_bank_account')
                ALTER TABLE [contract] DROP CONSTRAINT [FK_contract_selected_hotel_bank_account]
        `);
        await queryRunner.query(`IF COL_LENGTH('contract', 'selectedHotelBankAccountId') IS NOT NULL ALTER TABLE [contract] DROP COLUMN [selectedHotelBankAccountId]`);
        await queryRunner.query(`IF COL_LENGTH('contract', 'paymentPolicy') IS NOT NULL ALTER TABLE [contract] DROP COLUMN [paymentPolicy]`);
        await queryRunner.query(`
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_HOTEL_BANK_ACCOUNT_HOTEL_ACTIVE')
                DROP INDEX [IDX_HOTEL_BANK_ACCOUNT_HOTEL_ACTIVE] ON [hotel_bank_account]
        `);
        await queryRunner.query(`IF OBJECT_ID('hotel_bank_account', 'U') IS NOT NULL DROP TABLE [hotel_bank_account]`);
    }
}
