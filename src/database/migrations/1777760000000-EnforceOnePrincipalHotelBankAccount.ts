import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceOnePrincipalHotelBankAccount1777760000000 implements MigrationInterface {
    name = 'EnforceOnePrincipalHotelBankAccount1777760000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('hotel_bank_account', 'U') IS NOT NULL
            BEGIN
                ;WITH ranked AS (
                    SELECT
                        [id],
                        ROW_NUMBER() OVER (
                            PARTITION BY [hotelId]
                            ORDER BY
                                CASE WHEN [active] = 1 THEN 0 ELSE 1 END,
                                [updatedAt] DESC,
                                [id] ASC
                        ) AS rn
                    FROM [hotel_bank_account]
                    WHERE [isDefault] = 1
                )
                UPDATE hba
                SET [isDefault] = CASE WHEN ranked.rn = 1 THEN 1 ELSE 0 END
                FROM [hotel_bank_account] hba
                INNER JOIN ranked ON ranked.[id] = hba.[id]
            END
        `);

        await queryRunner.query(`
            IF OBJECT_ID('hotel_bank_account', 'U') IS NOT NULL
            BEGIN
                ;WITH hotels_without_principal AS (
                    SELECT hba.[hotelId]
                    FROM [hotel_bank_account] hba
                    WHERE hba.[active] = 1
                    GROUP BY hba.[hotelId]
                    HAVING SUM(CASE WHEN hba.[isDefault] = 1 THEN 1 ELSE 0 END) = 0
                ),
                ranked AS (
                    SELECT
                        hba.[id],
                        ROW_NUMBER() OVER (
                            PARTITION BY hba.[hotelId]
                            ORDER BY hba.[updatedAt] DESC, hba.[id] ASC
                        ) AS rn
                    FROM [hotel_bank_account] hba
                    INNER JOIN hotels_without_principal hwp ON hwp.[hotelId] = hba.[hotelId]
                    WHERE hba.[active] = 1
                )
                UPDATE hba
                SET [isDefault] = 1
                FROM [hotel_bank_account] hba
                INNER JOIN ranked ON ranked.[id] = hba.[id]
                WHERE ranked.rn = 1
            END
        `);

        await queryRunner.query(`
            IF OBJECT_ID('hotel_bank_account', 'U') IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'UQ_HOTEL_BANK_ACCOUNT_PRINCIPAL')
                CREATE UNIQUE INDEX [UQ_HOTEL_BANK_ACCOUNT_PRINCIPAL]
                ON [hotel_bank_account] ([hotelId])
                WHERE [isDefault] = 1
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'UQ_HOTEL_BANK_ACCOUNT_PRINCIPAL')
                DROP INDEX [UQ_HOTEL_BANK_ACCOUNT_PRINCIPAL] ON [hotel_bank_account]
        `);
    }
}
