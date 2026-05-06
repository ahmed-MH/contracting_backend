import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProformaVoucherNumber1776470400000 implements MigrationInterface {
    name = 'ProformaVoucherNumber1776470400000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF COL_LENGTH('proforma_invoice', 'voucherNumber') IS NULL
                ALTER TABLE [proforma_invoice] ADD [voucherNumber] varchar(100) NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF COL_LENGTH('proforma_invoice', 'voucherNumber') IS NOT NULL
                ALTER TABLE [proforma_invoice] DROP COLUMN [voucherNumber]
        `);
    }
}
