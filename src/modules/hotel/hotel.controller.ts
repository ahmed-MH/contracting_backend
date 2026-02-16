import { Controller, Get, Post, Patch, Delete, Body, Param, Headers, ParseIntPipe } from '@nestjs/common';
import { HotelService } from './hotel.service';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { CreateRoomTypeDto } from './dto/create-room-type.dto';
import { UpdateRoomTypeDto } from './dto/update-room-type.dto';
import { CreateArrangementDto } from './dto/create-arrangement.dto';
import { UpdateArrangementDto } from './dto/update-arrangement.dto';
import { CreateAffiliateDto } from './dto/create-affiliate.dto';
import { UpdateAffiliateDto } from './dto/update-affiliate.dto';

@Controller('hotel')
export class HotelController {
    constructor(private readonly hotelService: HotelService) { }

    // ─── Hotel ────────────────────────────────────────────────────────

    @Post()
    createHotel(@Body() dto: CreateHotelDto) {
        return this.hotelService.createHotel(dto);
    }

    @Get()
    findAllHotels() {
        return this.hotelService.findAllHotels();
    }

    @Patch(':id')
    updateHotel(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateHotelDto,
    ) {
        return this.hotelService.updateHotel(id, dto);
    }

    // ─── Room Types ───────────────────────────────────────────────────

    @Post('room-types')
    createRoomType(@Body() dto: CreateRoomTypeDto) {
        return this.hotelService.createRoomType(dto);
    }

    @Get('room-types')
    findAllRoomTypes() {
        return this.hotelService.findAllRoomTypes();
    }

    @Patch('room-types/:id')
    updateRoomType(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateRoomTypeDto,
    ) {
        return this.hotelService.updateRoomType(id, dto);
    }

    @Delete('room-types/:id')
    removeRoomType(@Param('id', ParseIntPipe) id: number) {
        return this.hotelService.removeRoomType(id);
    }

    // ─── Arrangements ─────────────────────────────────────────────────

    @Post('arrangements')
    createArrangement(@Body() dto: CreateArrangementDto) {
        return this.hotelService.createArrangement(dto);
    }

    @Get('arrangements')
    findAllArrangements() {
        return this.hotelService.findAllArrangements();
    }

    @Patch('arrangements/:id')
    updateArrangement(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateArrangementDto,
    ) {
        return this.hotelService.updateArrangement(id, dto);
    }

    @Delete('arrangements/:id')
    removeArrangement(@Param('id', ParseIntPipe) id: number) {
        return this.hotelService.removeArrangement(id);
    }

    // ─── Affiliates ───────────────────────────────────────────────────

    @Post('affiliates')
    createAffiliate(@Body() dto: CreateAffiliateDto) {
        return this.hotelService.createAffiliate(dto);
    }

    @Get('affiliates')
    findAllAffiliates() {
        return this.hotelService.findAllAffiliates();
    }

    @Patch('affiliates/:id')
    updateAffiliate(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateAffiliateDto,
    ) {
        return this.hotelService.updateAffiliate(id, dto);
    }

    @Delete('affiliates/:id')
    removeAffiliate(@Param('id', ParseIntPipe) id: number) {
        return this.hotelService.removeAffiliate(id);
    }
}
