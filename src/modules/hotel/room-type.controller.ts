import { AuthenticatedRequest } from '../../common/interfaces/request.interface';
import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { RoomTypeService } from './room-type.service';
import { CreateRoomTypeDto } from './dto/create-room-type.dto';
import { UpdateRoomTypeDto } from './dto/update-room-type.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { Request } from 'express';

@Controller('hotel')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class RoomTypeController {
    constructor(private readonly roomTypeService: RoomTypeService) { }

    private getHotelId(req: AuthenticatedRequest): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    @Post('room-types')
    createRoomType(@Req() req: AuthenticatedRequest, @Body() dto: CreateRoomTypeDto) {
        return this.roomTypeService.createRoomType(this.getHotelId(req), dto);
    }

    @Get('room-types')
    findAllRoomTypes(@Req() req: AuthenticatedRequest) {
        return this.roomTypeService.findAllRoomTypes(this.getHotelId(req));
    }

    @Get('room-types/archived')
    findArchivedRoomTypes(@Req() req: AuthenticatedRequest) {
        return this.roomTypeService.findArchivedRoomTypes(this.getHotelId(req));
    }

    @Patch('room-types/:id')
    updateRoomType(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateRoomTypeDto,
    ) {
        return this.roomTypeService.updateRoomType(this.getHotelId(req), id, dto);
    }

    @Delete('room-types/:id')
    removeRoomType(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.roomTypeService.removeRoomType(this.getHotelId(req), id);
    }

    @Patch('room-types/:id/restore')
    restoreRoomType(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.roomTypeService.restoreRoomType(this.getHotelId(req), id);
    }
}
