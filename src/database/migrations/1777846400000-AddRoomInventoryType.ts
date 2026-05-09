import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoomInventoryType1777846400000 implements MigrationInterface {
    name = 'AddRoomInventoryType1777846400000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF COL_LENGTH('room_type', 'inventoryType') IS NULL
                ALTER TABLE [room_type]
                ADD [inventoryType] nvarchar(20) NOT NULL
                CONSTRAINT [DF_room_type_inventoryType] DEFAULT 'STANDARD'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            IF COL_LENGTH('room_type', 'inventoryType') IS NOT NULL
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM sys.default_constraints
                    WHERE [name] = 'DF_room_type_inventoryType'
                )
                    ALTER TABLE [room_type] DROP CONSTRAINT [DF_room_type_inventoryType]

                ALTER TABLE [room_type] DROP COLUMN [inventoryType]
            END
        `);
    }
}
