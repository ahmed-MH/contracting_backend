import { Controller, Get, Post, Body, Patch, Param, Delete, Req, ParseIntPipe } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';
import { ContractEarlyBookingService } from './contract-early-booking.service';
import { ImportEarlyBookingDto } from './dto/import-early-booking.dto';
import { UpdateContractEarlyBookingDto } from './dto/update-contract-early-booking.dto';

@Controller('contracts')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ContractEarlyBookingController {
    constructor(private readonly contractEarlyBookingService: ContractEarlyBookingService) { }

    private getHotelId(req: Request): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    @Get(':contractId/early-bookings')
    findByContract(@Param('contractId', ParseIntPipe) contractId: number) {
        return this.contractEarlyBookingService.findByContract(contractId);
    }

    @Post(':contractId/early-bookings/import')
    importFromTemplate(
        @Req() req: Request,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: ImportEarlyBookingDto,
    ) {
        return this.contractEarlyBookingService.importFromTemplate(
            contractId,
            dto.templateId,
            this.getHotelId(req),
        );
    }

    @Patch('early-bookings/:id')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateContractEarlyBookingDto,
    ) {
        return this.contractEarlyBookingService.update(id, dto);
    }

    @Delete('early-bookings/:id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.contractEarlyBookingService.remove(id);
    }
}
