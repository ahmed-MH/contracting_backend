import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractLine } from '../contract/core/entities/contract-line.entity';
import { Price } from '../contract/core/entities/price.entity';
import { Promotion } from '../contract/core/entities/promotion.entity';
import { Period } from '../contract/core/entities/period.entity';
import { ContractRoom } from '../contract/core/entities/contract-room.entity';
import { Arrangement } from '../hotel/entities/arrangement.entity';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ContractLine,
            Price,
            Promotion,
            Period,
            ContractRoom,
            Arrangement,
        ]),
    ],
    controllers: [PricingController],
    providers: [PricingService],
    exports: [PricingService],
})
export class PricingModule { }
