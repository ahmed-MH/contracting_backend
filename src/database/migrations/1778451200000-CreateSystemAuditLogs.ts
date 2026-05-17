import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSystemAuditLogs1778451200000 implements MigrationInterface {
    name = 'CreateSystemAuditLogs1778451200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF OBJECT_ID('system_audit_log', 'U') IS NULL
            CREATE TABLE [system_audit_log] (
                [id] int IDENTITY(1,1) NOT NULL,
                [eventType] varchar(100) NOT NULL,
                [category] varchar(40) NOT NULL,
                [severity] varchar(20) NOT NULL CONSTRAINT [DF_system_audit_log_severity] DEFAULT 'INFO',
                [message] nvarchar(1000) NOT NULL,
                [actorUserId] int NULL,
                [actorEmail] nvarchar(255) NULL,
                [actorRole] varchar(50) NULL,
                [tenantId] int NULL,
                [tenantName] nvarchar(255) NULL,
                [targetType] nvarchar(100) NULL,
                [targetId] nvarchar(100) NULL,
                [metadata] nvarchar(MAX) NULL,
                [ipAddress] nvarchar(100) NULL,
                [userAgent] nvarchar(500) NULL,
                [createdAt] datetime2 NOT NULL CONSTRAINT [DF_system_audit_log_createdAt] DEFAULT SYSUTCDATETIME(),
                CONSTRAINT [PK_system_audit_log] PRIMARY KEY ([id])
            )
        `);

        await queryRunner.query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_system_audit_log_createdAt') CREATE INDEX [IDX_system_audit_log_createdAt] ON [system_audit_log] ([createdAt])`);
        await queryRunner.query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_system_audit_log_category') CREATE INDEX [IDX_system_audit_log_category] ON [system_audit_log] ([category])`);
        await queryRunner.query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_system_audit_log_severity') CREATE INDEX [IDX_system_audit_log_severity] ON [system_audit_log] ([severity])`);
        await queryRunner.query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_system_audit_log_tenantId') CREATE INDEX [IDX_system_audit_log_tenantId] ON [system_audit_log] ([tenantId])`);
        await queryRunner.query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_system_audit_log_actorUserId') CREATE INDEX [IDX_system_audit_log_actorUserId] ON [system_audit_log] ([actorUserId])`);
        await queryRunner.query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_system_audit_log_eventType') CREATE INDEX [IDX_system_audit_log_eventType] ON [system_audit_log] ([eventType])`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_system_audit_log_eventType') DROP INDEX [IDX_system_audit_log_eventType] ON [system_audit_log]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_system_audit_log_actorUserId') DROP INDEX [IDX_system_audit_log_actorUserId] ON [system_audit_log]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_system_audit_log_tenantId') DROP INDEX [IDX_system_audit_log_tenantId] ON [system_audit_log]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_system_audit_log_severity') DROP INDEX [IDX_system_audit_log_severity] ON [system_audit_log]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_system_audit_log_category') DROP INDEX [IDX_system_audit_log_category] ON [system_audit_log]`);
        await queryRunner.query(`IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IDX_system_audit_log_createdAt') DROP INDEX [IDX_system_audit_log_createdAt] ON [system_audit_log]`);
        await queryRunner.query(`IF OBJECT_ID('system_audit_log', 'U') IS NOT NULL DROP TABLE [system_audit_log]`);
    }
}
