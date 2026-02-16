import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractLine } from '../contract/entities/contract-line.entity';
import { Price } from '../contract/entities/price.entity';
import { Allotment } from '../contract/entities/allotment.entity';
import { Promotion } from '../contract/entities/promotion.entity';
import { Supplement } from '../contract/entities/supplement.entity';
import { Period } from '../contract/entities/period.entity';
import { ContractRoom } from '../contract/entities/contract-room.entity';
import { Arrangement } from '../hotel/entities/arrangement.entity';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ContractLine,
            Price,
            Allotment,
            Promotion,
            Supplement,
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
