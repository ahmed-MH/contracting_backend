import { AuthenticatedRequest } from '../../../common/interfaces/request.interface';
import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query, Req } from '@nestjs/common';
import { TemplateEarlyBookingService } from './template-early-booking.service';
import { CreateTemplateEarlyBookingDto } from './dto/create-template-early-booking.dto';
import { UpdateTemplateEarlyBookingDto } from './dto/update-template-early-booking.dto';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';
import { Request } from 'express';

@Controller('hotel')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class TemplateEarlyBookingController {
    constructor(private readonly templateEarlyBookingService: TemplateEarlyBookingService) { }

    private getHotelId(req: AuthenticatedRequest): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    @Get('early-bookings')
    findAllTemplateEarlyBookings(
        @Req() req: AuthenticatedRequest,
        @Query() pageOptions: PageOptionsDto,
    ) {
        return this.templateEarlyBookingService.findAllTemplateEarlyBookings(this.getHotelId(req), pageOptions);
    }

    @Get('early-bookings/archived')
    findArchivedTemplateEarlyBookings(@Req() req: AuthenticatedRequest) {
        return this.templateEarlyBookingService.findArchivedTemplateEarlyBookings(this.getHotelId(req));
    }

    @Post('early-bookings')
    createTemplateEarlyBooking(
        @Req() req: AuthenticatedRequest,
        @Body() dto: CreateTemplateEarlyBookingDto,
    ) {
        return this.templateEarlyBookingService.createTemplateEarlyBooking(this.getHotelId(req), dto);
    }

    @Patch('early-bookings/:id')
    updateTemplateEarlyBooking(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateTemplateEarlyBookingDto,
    ) {
        return this.templateEarlyBookingService.updateTemplateEarlyBooking(this.getHotelId(req), id, dto);
    }

    @Delete('early-bookings/:id')
    removeTemplateEarlyBooking(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.templateEarlyBookingService.removeTemplateEarlyBooking(this.getHotelId(req), id);
    }

    @Patch('early-bookings/:id/restore')
    restoreTemplateEarlyBooking(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.templateEarlyBookingService.restoreTemplateEarlyBooking(this.getHotelId(req), id);
    }
}
