import { AuthenticatedRequest } from '../../common/interfaces/request.interface';
import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { HotelService } from './hotel.service';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';

import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { Request } from 'express';
import { RequestUser } from '../../common/interfaces/request.interface';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('hotel')
@Roles(UserRole.ADMIN)
@SkipHotelCheck()
export class HotelController {
    constructor(private readonly hotelService: HotelService) { }

    private getHotelId(req: AuthenticatedRequest): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    // ─── Hotel Management ─────────────────────────────────────────────

    @Post()
    createHotel(@Body() dto: CreateHotelDto, @CurrentUser() user: RequestUser) {
        return this.hotelService.createHotel(dto, user);
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    findAllHotels(@CurrentUser() user: RequestUser) {
        return this.hotelService.findAllHotels(user);
    }

    @Get('archived')
    findArchivedHotels() {
        return this.hotelService.findArchivedHotels();
    }

    @Patch(':id')
    updateHotel(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateHotelDto,
    ) {
        return this.hotelService.updateHotel(id, dto);
    }

    @Delete(':id')
    removeHotel(@Param('id', ParseIntPipe) id: number) {
        return this.hotelService.removeHotel(id);
    }

    @Patch(':id/restore')
    restoreHotel(@Param('id', ParseIntPipe) id: number) {
        return this.hotelService.restoreHotel(id);
    }

    // ─── Room Types (Extracted to RoomTypeController) ────────────────

    // ─── Arrangements (Extracted to ArrangementController) ───────────

    // ─── Template Supplements (Extracted) ────────────────

    // ─── Template Reductions (Extracted) ────────────────

    // ─── Template Monoparental Rules (Extracted) ────────────────

    // ─── Template Early Bookings (Extracted) ────────────────
}
