import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Hotel } from './entities/hotel.entity';
import { RoomType } from './entities/room-type.entity';
import { Arrangement } from './entities/arrangement.entity';
import { HotelService } from './hotel.service';
import { HotelController } from './hotel.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([Hotel, RoomType, Arrangement]),
    ],
    controllers: [HotelController],
    providers: [HotelService],
    exports: [HotelService],
})
export class HotelModule { }
