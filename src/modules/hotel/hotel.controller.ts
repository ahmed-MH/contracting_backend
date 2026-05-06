import { AuthenticatedRequest } from '../../common/interfaces/request.interface';
import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HotelService } from './hotel.service';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';

import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { Request } from 'express';
import { RequestUser } from '../../common/interfaces/request.interface';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

interface UploadedLogoFile {
    mimetype: string;
    buffer: Buffer;
}

@Controller('hotel')
@Roles(UserRole.ADMIN)
@SkipHotelCheck()
export class HotelController {
    constructor(private readonly hotelService: HotelService) { }
    private static readonly MAX_LOGO_FILE_SIZE = 5 * 1024 * 1024;

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
    findArchivedHotels(@CurrentUser() user: RequestUser) {
        return this.hotelService.findArchivedHotels(user);
    }

    @Patch(':id')
    updateHotel(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateHotelDto,
        @CurrentUser() user: RequestUser,
    ) {
        return this.hotelService.updateHotel(id, dto, user);
    }

    @Post(':id/logo')
    @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: HotelController.MAX_LOGO_FILE_SIZE },
    }))
    uploadHotelLogo(
        @Param('id', ParseIntPipe) id: number,
        @UploadedFile() file?: UploadedLogoFile,
        @CurrentUser() user?: RequestUser,
    ) {
        if (!file) {
            throw new BadRequestException('A logo image file is required');
        }

        return this.hotelService.updateHotelLogo(id, file, user);
    }

    @Delete(':id')
    removeHotel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
        return this.hotelService.removeHotel(id, user);
    }

    @Patch(':id/restore')
    restoreHotel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
        return this.hotelService.restoreHotel(id, user);
    }

    // ─── Room Types (Extracted to RoomTypeController) ────────────────

    // ─── Arrangements (Extracted to ArrangementController) ───────────

    // ─── Template Supplements (Extracted) ────────────────

    // ─── Template Reductions (Extracted) ────────────────

    // ─── Template Monoparental Rules (Extracted) ────────────────

    // ─── Template Early Bookings (Extracted) ────────────────
}
