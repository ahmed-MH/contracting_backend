import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { HotelService } from './hotel.service';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { CreateRoomTypeDto } from './dto/create-room-type.dto';
import { UpdateRoomTypeDto } from './dto/update-room-type.dto';
import { CreateArrangementDto } from './dto/create-arrangement.dto';
import { UpdateArrangementDto } from './dto/update-arrangement.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';

@Controller('hotel')
export class HotelController {
    constructor(private readonly hotelService: HotelService) { }

    // ─── Hotel Management (ADMIN only) ───────────────────────────────

    @Post()
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    createHotel(@Body() dto: CreateHotelDto) {
        return this.hotelService.createHotel(dto);
    }

    @Get()
    findAllHotels() {
        return this.hotelService.findAllHotels();
    }

    @Get('archived')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    findArchivedHotels() {
        return this.hotelService.findArchivedHotels();
    }

    @Patch(':id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    updateHotel(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateHotelDto,
    ) {
        return this.hotelService.updateHotel(id, dto);
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    removeHotel(@Param('id', ParseIntPipe) id: number) {
        return this.hotelService.removeHotel(id);
    }

    @Patch(':id/restore')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    restoreHotel(@Param('id', ParseIntPipe) id: number) {
        return this.hotelService.restoreHotel(id);
    }

    // ─── Room Types (ADMIN + COMMERCIAL can CUD, all can read) ───────

    @Post('room-types')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    createRoomType(@Body() dto: CreateRoomTypeDto) {
        return this.hotelService.createRoomType(dto);
    }

    @Get('room-types')
    findAllRoomTypes() {
        return this.hotelService.findAllRoomTypes();
    }

    @Get('room-types/archived')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    findArchivedRoomTypes() {
        return this.hotelService.findArchivedRoomTypes();
    }

    @Patch('room-types/:id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    updateRoomType(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateRoomTypeDto,
    ) {
        return this.hotelService.updateRoomType(id, dto);
    }

    @Delete('room-types/:id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    removeRoomType(@Param('id', ParseIntPipe) id: number) {
        return this.hotelService.removeRoomType(id);
    }

    @Patch('room-types/:id/restore')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    restoreRoomType(@Param('id', ParseIntPipe) id: number) {
        return this.hotelService.restoreRoomType(id);
    }

    // ─── Arrangements (ADMIN + COMMERCIAL can CUD, all can read) ─────

    @Post('arrangements')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    createArrangement(@Body() dto: CreateArrangementDto) {
        return this.hotelService.createArrangement(dto);
    }

    @Get('arrangements')
    findAllArrangements() {
        return this.hotelService.findAllArrangements();
    }

    @Get('arrangements/archived')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    findArchivedArrangements() {
        return this.hotelService.findArchivedArrangements();
    }

    @Patch('arrangements/:id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    updateArrangement(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateArrangementDto,
    ) {
        return this.hotelService.updateArrangement(id, dto);
    }

    @Delete('arrangements/:id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    removeArrangement(@Param('id', ParseIntPipe) id: number) {
        return this.hotelService.removeArrangement(id);
    }

    @Patch('arrangements/:id/restore')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    restoreArrangement(@Param('id', ParseIntPipe) id: number) {
        return this.hotelService.restoreArrangement(id);
    }
}
