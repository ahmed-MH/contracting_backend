import { AuthenticatedRequest } from '../../../common/interfaces/request.interface';
import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query, Req } from '@nestjs/common';
import { TemplateReductionService } from './template-reduction.service';
import { CreateTemplateReductionDto } from './dto/create-template-reduction.dto';
import { UpdateTemplateReductionDto } from './dto/update-template-reduction.dto';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';
import { Request } from 'express';

@Controller('hotel')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class TemplateReductionController {
    constructor(private readonly templateReductionService: TemplateReductionService) { }

    private getHotelId(req: AuthenticatedRequest): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    @Get('reductions')
    findAllTemplateReductions(
        @Req() req: AuthenticatedRequest,
        @Query() pageOptions: PageOptionsDto,
    ) {
        return this.templateReductionService.findAllTemplateReductions(this.getHotelId(req), pageOptions);
    }

    @Get('reductions/archived')
    findArchivedTemplateReductions(@Req() req: AuthenticatedRequest) {
        return this.templateReductionService.findArchivedTemplateReductions(this.getHotelId(req));
    }

    @Post('reductions')
    createTemplateReduction(
        @Req() req: AuthenticatedRequest,
        @Body() dto: CreateTemplateReductionDto,
    ) {
        return this.templateReductionService.createTemplateReduction(this.getHotelId(req), dto);
    }

    @Patch('reductions/:id')
    updateTemplateReduction(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateTemplateReductionDto,
    ) {
        return this.templateReductionService.updateTemplateReduction(this.getHotelId(req), id, dto);
    }

    @Delete('reductions/:id')
    removeTemplateReduction(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.templateReductionService.removeTemplateReduction(this.getHotelId(req), id);
    }

    @Patch('reductions/:id/restore')
    restoreTemplateReduction(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.templateReductionService.restoreTemplateReduction(this.getHotelId(req), id);
    }
}
