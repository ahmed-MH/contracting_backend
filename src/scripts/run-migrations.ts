import { join } from 'path';
import { DataSource } from 'typeorm';
import { buildDataSourceMssqlConfig } from '../config/database.config';

const dataSource = new DataSource({
    ...buildDataSourceMssqlConfig({
        get: (key) => process.env[key],
    }),
    entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
    migrations: [join(__dirname, '../database/migrations/*{.ts,.js}')],
    synchronize: false,
});

async function run() {
    await dataSource.initialize();
    const migrations = await dataSource.runMigrations();
    if (migrations.length === 0) {
        console.log('No pending migrations.');
    } else {
        console.log(`Applied ${migrations.length} migration(s):`);
        migrations.forEach((migration) => console.log(`- ${migration.name}`));
    }
    await dataSource.destroy();
}

run().catch(async (error) => {
    console.error('Migration failed:', error);
    if (dataSource.isInitialized) {
        await dataSource.destroy();
    }
    process.exit(1);
});
