import { createConnection } from 'typeorm';
import { ContractSpo } from '../src/modules/contract/spo/entities/contract-spo.entity';

async function check() {
    const connection = await createConnection();
    const spos = await connection.getRepository(ContractSpo).find();
    console.log(JSON.stringify(spos, null, 2));
    await connection.close();
}
check();
