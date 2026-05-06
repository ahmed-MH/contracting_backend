import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProformaDraftIssueLifecycle1776988800000 implements MigrationInterface {
    name = 'ProformaDraftIssueLifecycle1776988800000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF COL_LENGTH('proforma_invoice', 'documentSnapshot') IS NULL
                ALTER TABLE [proforma_invoice] ADD [documentSnapshot] nvarchar(MAX) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('proforma_invoice', 'issuedAt') IS NULL
                ALTER TABLE [proforma_invoice] ADD [issuedAt] datetime2 NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('proforma_invoice', 'issuedByUserId') IS NULL
                ALTER TABLE [proforma_invoice] ADD [issuedByUserId] int NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('proforma_invoice', 'issuedByName') IS NULL
                ALTER TABLE [proforma_invoice] ADD [issuedByName] nvarchar(255) NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('proforma_invoice', 'issuedByEmail') IS NULL
                ALTER TABLE [proforma_invoice] ADD [issuedByEmail] nvarchar(255) NULL
        `);

        await queryRunner.query(`
            UPDATE pf
            SET
                pf.[status] = CASE WHEN pf.[status] = 'GENERATED' THEN 'ISSUED' ELSE pf.[status] END,
                pf.[issuedAt] = COALESCE(pf.[issuedAt], pf.[generatedAt], pf.[updatedAt], pf.[createdAt], SYSUTCDATETIME()),
                pf.[issuedByUserId] = COALESCE(pf.[issuedByUserId], pf.[updatedByUserId], pf.[generatedByUserId], pf.[createdByUserId]),
                pf.[issuedByName] = COALESCE(pf.[issuedByName], pf.[updatedByName], pf.[createdByName], 'System'),
                pf.[issuedByEmail] = COALESCE(pf.[issuedByEmail], pf.[updatedByEmail], pf.[createdByEmail])
            FROM [proforma_invoice] pf
            WHERE pf.[status] = 'GENERATED'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE pf
            SET pf.[status] = 'GENERATED'
            FROM [proforma_invoice] pf
            WHERE pf.[status] = 'ISSUED'
        `);
        await queryRunner.query(`IF COL_LENGTH('proforma_invoice', 'issuedByEmail') IS NOT NULL ALTER TABLE [proforma_invoice] DROP COLUMN [issuedByEmail]`);
        await queryRunner.query(`IF COL_LENGTH('proforma_invoice', 'issuedByName') IS NOT NULL ALTER TABLE [proforma_invoice] DROP COLUMN [issuedByName]`);
        await queryRunner.query(`IF COL_LENGTH('proforma_invoice', 'issuedByUserId') IS NOT NULL ALTER TABLE [proforma_invoice] DROP COLUMN [issuedByUserId]`);
        await queryRunner.query(`IF COL_LENGTH('proforma_invoice', 'issuedAt') IS NOT NULL ALTER TABLE [proforma_invoice] DROP COLUMN [issuedAt]`);
        await queryRunner.query(`IF COL_LENGTH('proforma_invoice', 'documentSnapshot') IS NOT NULL ALTER TABLE [proforma_invoice] DROP COLUMN [documentSnapshot]`);
    }
}
