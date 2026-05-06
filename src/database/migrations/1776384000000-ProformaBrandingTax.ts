import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProformaBrandingTax1776384000000 implements MigrationInterface {
    name = 'ProformaBrandingTax1776384000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF COL_LENGTH('hotel', 'preferredThemeColor') IS NULL
                ALTER TABLE [hotel] ADD [preferredThemeColor] varchar(7) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('proforma_invoice', 'taxEnabled') IS NULL
                ALTER TABLE [proforma_invoice] ADD [taxEnabled] bit NOT NULL CONSTRAINT [DF_proforma_invoice_taxEnabled] DEFAULT 0
        `);
        await queryRunner.query(`
            IF COL_LENGTH('proforma_invoice', 'taxAmount') IS NULL
                ALTER TABLE [proforma_invoice] ADD [taxAmount] decimal(18,2) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('proforma_invoice', 'documentLogoUrl') IS NULL
                ALTER TABLE [proforma_invoice] ADD [documentLogoUrl] nvarchar(MAX) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('proforma_invoice', 'documentThemeColor') IS NULL
                ALTER TABLE [proforma_invoice] ADD [documentThemeColor] varchar(7) NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`IF COL_LENGTH('proforma_invoice', 'documentThemeColor') IS NOT NULL ALTER TABLE [proforma_invoice] DROP COLUMN [documentThemeColor]`);
        await queryRunner.query(`IF COL_LENGTH('proforma_invoice', 'documentLogoUrl') IS NOT NULL ALTER TABLE [proforma_invoice] DROP COLUMN [documentLogoUrl]`);
        await queryRunner.query(`IF COL_LENGTH('proforma_invoice', 'taxAmount') IS NOT NULL ALTER TABLE [proforma_invoice] DROP COLUMN [taxAmount]`);
        await queryRunner.query(`
            IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_proforma_invoice_taxEnabled')
                ALTER TABLE [proforma_invoice] DROP CONSTRAINT [DF_proforma_invoice_taxEnabled]
        `);
        await queryRunner.query(`IF COL_LENGTH('proforma_invoice', 'taxEnabled') IS NOT NULL ALTER TABLE [proforma_invoice] DROP COLUMN [taxEnabled]`);
        await queryRunner.query(`IF COL_LENGTH('hotel', 'preferredThemeColor') IS NOT NULL ALTER TABLE [hotel] DROP COLUMN [preferredThemeColor]`);
    }
}
