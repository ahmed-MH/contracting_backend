import { DataSource } from 'typeorm';
import { join } from 'path';

const dataSource = new DataSource({
    type: 'mssql',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '1433', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    synchronize: false,
    options: {
        encrypt: false,
        trustServerCertificate: true,
    },
});

async function run() {
    await dataSource.initialize();
    console.log('Connected.');
    await dataSource.dropDatabase();
    console.log('Database dropped.');
    await dataSource.destroy();
}

run().catch(console.error);
