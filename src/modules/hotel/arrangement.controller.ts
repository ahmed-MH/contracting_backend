import { AuthenticatedRequest } from '../../common/interfaces/request.interface';
import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { ArrangementService } from './arrangement.service';
import { CreateArrangementDto } from './dto/create-arrangement.dto';
import { UpdateArrangementDto } from './dto/update-arrangement.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { Request } from 'express';

@Controller('hotel')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ArrangementController {
    constructor(private readonly arrangementService: ArrangementService) { }

    private getHotelId(req: AuthenticatedRequest): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    @Post('arrangements')
    createArrangement(@Req() req: AuthenticatedRequest, @Body() dto: CreateArrangementDto) {
        return this.arrangementService.createArrangement(this.getHotelId(req), dto);
    }

    @Get('arrangements')
    findAllArrangements(@Req() req: AuthenticatedRequest) {
        return this.arrangementService.findAllArrangements(this.getHotelId(req));
    }

    @Get('arrangements/archived')
    findArchivedArrangements(@Req() req: AuthenticatedRequest) {
        return this.arrangementService.findArchivedArrangements(this.getHotelId(req));
    }

    @Patch('arrangements/:id')
    updateArrangement(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateArrangementDto,
    ) {
        return this.arrangementService.updateArrangement(this.getHotelId(req), id, dto);
    }

    @Delete('arrangements/:id')
    removeArrangement(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.arrangementService.removeArrangement(this.getHotelId(req), id);
    }

    @Patch('arrangements/:id/restore')
    restoreArrangement(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.arrangementService.restoreArrangement(this.getHotelId(req), id);
    }
}
