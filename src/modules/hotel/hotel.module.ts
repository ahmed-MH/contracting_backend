import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Hotel } from './entities/hotel.entity';
import { RoomType } from './entities/room-type.entity';
import { Arrangement } from './entities/arrangement.entity';
import { HotelService } from './hotel.service';
import { HotelController } from './hotel.controller';
import { RoomTypeController } from './room-type.controller';
import { RoomTypeService } from './room-type.service';
import { ArrangementController } from './arrangement.controller';
import { ArrangementService } from './arrangement.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([Hotel, RoomType, Arrangement]),
    ],
    controllers: [
        HotelController,
        RoomTypeController,
        ArrangementController,
    ],
    providers: [
        HotelService,
        RoomTypeService,
        ArrangementService,
    ],
    exports: [HotelService],
})
export class HotelModule { }
