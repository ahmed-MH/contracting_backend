import { DataSource } from 'typeorm';
import { buildDataSourceMssqlConfig } from '../config/database.config';

const dataSource = new DataSource({
    ...buildDataSourceMssqlConfig({
        get: (key) => process.env[key],
    }),
    synchronize: false,
});

async function run() {
    await dataSource.initialize();
    console.log('Connected.');
    await dataSource.dropDatabase();
    console.log('Database dropped.');
    await dataSource.destroy();
}

run().catch(console.error);
