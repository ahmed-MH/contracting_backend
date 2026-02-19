import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Hotel } from '../hotel/entities/hotel.entity'; // Added import for Hotel
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { HotelModule } from '../hotel/hotel.module'; // Added import for HotelModule

@Module({
    imports: [
        TypeOrmModule.forFeature([User, Hotel]),
        HotelModule,
    ],
    controllers: [UsersController],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule { }
