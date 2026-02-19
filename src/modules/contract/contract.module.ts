import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from './entities/contract.entity';
import { Period } from './entities/period.entity';
import { ContractRoom } from './entities/contract-room.entity';
import { Affiliate } from '../affiliate/entities/affiliate.entity';
import { RoomType } from '../hotel/entities/room-type.entity';
import { ContractService } from './contract.service';
import { ContractController } from './contract.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([Contract, Period, ContractRoom, Affiliate, RoomType]),
    ],
    controllers: [ContractController],
    providers: [ContractService],
    exports: [ContractService],
})
export class ContractModule { }
