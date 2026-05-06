import { AuthenticatedRequest } from '../../../common/interfaces/request.interface';
import { Controller, Get, Post, Body, Patch, Param, Delete, Req, ParseIntPipe } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { UserRole } from '../../../common/constants/enums';
import { RequestUser } from '../../../common/interfaces/request.interface';
import { ContractEarlyBookingService } from './contract-early-booking.service';
import { ImportEarlyBookingDto } from './dto/import-early-booking.dto';
import { UpdateContractEarlyBookingDto } from './dto/update-contract-early-booking.dto';

@Controller('contracts')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ContractEarlyBookingController {
    constructor(private readonly contractEarlyBookingService: ContractEarlyBookingService) { }

    private getHotelId(req: AuthenticatedRequest): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    @Get(':contractId/early-bookings')
    findByContract(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
    ) {
        return this.contractEarlyBookingService.findByContract(this.getHotelId(req), contractId);
    }

    @Post(':contractId/early-bookings/import')
    importFromTemplate(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: ImportEarlyBookingDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.contractEarlyBookingService.importFromTemplate(
            this.getHotelId(req),
            contractId,
            dto.templateId,
            user,
        );
    }

    @Patch('early-bookings/:id')
    update(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateContractEarlyBookingDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.contractEarlyBookingService.update(this.getHotelId(req), id, dto, user);
    }

    @Delete('early-bookings/:id')
    remove(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) id: number,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.contractEarlyBookingService.remove(this.getHotelId(req), id, user);
    }
}
