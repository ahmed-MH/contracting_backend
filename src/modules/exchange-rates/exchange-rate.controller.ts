import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { CreateExchangeRateDto, UpdateExchangeRateDto } from './dto/exchange-rate.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/constants/enums';
import { RequestUser } from '../../common/interfaces/request.interface';

@Controller(['exchange-rates/hotels/:hotelId', 'hotel/:hotelId/exchange-rates'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExchangeRateController {
    constructor(private readonly exchangeRateService: ExchangeRateService) {}

    @Post()
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    async create(
        @Param('hotelId', ParseIntPipe) hotelId: number,
        @Body() createDto: CreateExchangeRateDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.exchangeRateService.create(hotelId, createDto, user?.email);
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.AGENT)
    async findAll(@Param('hotelId', ParseIntPipe) hotelId: number) {
        return this.exchangeRateService.findAll(hotelId);
    }

    @Get(':id')
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.AGENT)
    async findOne(
        @Param('hotelId', ParseIntPipe) hotelId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.exchangeRateService.findOne(hotelId, id);
    }

    @Put(':id')
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    async update(
        @Param('hotelId', ParseIntPipe) hotelId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() updateDto: UpdateExchangeRateDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.exchangeRateService.update(hotelId, id, updateDto, user?.email);
    }

    @Delete(':id')
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    async remove(
        @Param('hotelId', ParseIntPipe) hotelId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        await this.exchangeRateService.remove(hotelId, id);
        return { success: true };
    }
}
