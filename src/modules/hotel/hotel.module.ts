import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Hotel } from './entities/hotel.entity';
import { RoomType } from './entities/room-type.entity';
import { Arrangement } from './entities/arrangement.entity';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { HotelService } from './hotel.service';
import { HotelController } from './hotel.controller';
import { RoomTypeController } from './room-type.controller';
import { RoomTypeService } from './room-type.service';
import { ArrangementController } from './arrangement.controller';
import { ArrangementService } from './arrangement.service';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateController } from './exchange-rate.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([Hotel, RoomType, Arrangement, ExchangeRate]),
    ],
    controllers: [
        HotelController,
        RoomTypeController,
        ArrangementController,
        ExchangeRateController,
    ],
    providers: [
        HotelService,
        RoomTypeService,
        ArrangementService,
        ExchangeRateService,
    ],
    exports: [HotelService, ExchangeRateService],
})
export class HotelModule { }
