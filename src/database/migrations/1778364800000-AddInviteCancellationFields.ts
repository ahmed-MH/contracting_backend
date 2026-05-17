import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInviteCancellationFields1778364800000 implements MigrationInterface {
    name = 'AddInviteCancellationFields1778364800000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF COL_LENGTH('user', 'invitationCanceledAt') IS NULL
                ALTER TABLE [user] ADD [invitationCanceledAt] datetime2 NULL
        `);
        await queryRunner.query(`
            IF COL_LENGTH('user', 'invitationCanceledByUserId') IS NULL
                ALTER TABLE [user] ADD [invitationCanceledByUserId] int NULL
        `);
        await queryRunner.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_user_tenant_pending_invite')
                CREATE INDEX [IDX_user_tenant_pending_invite]
                ON [user] ([tenantId], [isActive], [invitationCanceledAt])
                INCLUDE ([invitationToken], [role])
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_user_tenant_pending_invite') DROP INDEX [IDX_user_tenant_pending_invite] ON [user]`);
        await queryRunner.query(`IF COL_LENGTH('user', 'invitationCanceledByUserId') IS NOT NULL ALTER TABLE [user] DROP COLUMN [invitationCanceledByUserId]`);
        await queryRunner.query(`IF COL_LENGTH('user', 'invitationCanceledAt') IS NOT NULL ALTER TABLE [user] DROP COLUMN [invitationCanceledAt]`);
    }
}
