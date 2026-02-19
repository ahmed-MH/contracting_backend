
import { DataSource } from 'typeorm';
import { join } from 'path';

// Environment variables are loaded via node --env-file flag

const dataSource = new DataSource({
    type: 'mssql',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '1433', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
    synchronize: true, // This will be used to resync
    dropSchema: true,   // This enables dropping the schema
    options: {
        encrypt: false,
        trustServerCertificate: true,
    },
});

async function resetDb() {
    try {
        console.log('Connecting to database...');
        await dataSource.initialize();
        console.log('Connected.');

        console.log('Dropping schema...');
        await dataSource.dropDatabase(); // Or synchronize(true) which drops and recreates
        console.log('Schema dropped.');

        console.log('Synchronizing schema...');
        await dataSource.synchronize();
        console.log('Schema synchronized and DB reset.');

        await dataSource.destroy();
        process.exit(0);
    } catch (error) {
        console.error('Error resetting database:', error);
        process.exit(1);
    }
}

resetDb();
