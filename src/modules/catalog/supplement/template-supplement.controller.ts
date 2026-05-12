import { AuthenticatedRequest } from '../../../common/interfaces/request.interface';
import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query, Req } from '@nestjs/common';
import { TemplateSupplementService } from './template-supplement.service';
import { CreateTemplateSupplementDto } from './dto/create-template-supplement.dto';
import { UpdateTemplateSupplementDto } from './dto/update-template-supplement.dto';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequestUser } from '../../../common/interfaces/request.interface';

@Controller('hotel')
@Roles(UserRole.COMMERCIAL)
export class TemplateSupplementController {
    constructor(private readonly templateSupplementService: TemplateSupplementService) { }

    private getHotelId(req: AuthenticatedRequest): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    @Get('supplements')
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    findAllTemplateSupplements(
        @Req() req: AuthenticatedRequest,
        @Query() pageOptions: PageOptionsDto,
    ) {
        return this.templateSupplementService.findAllTemplateSupplements(this.getHotelId(req), pageOptions);
    }

    @Get('supplements/archived')
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    findArchivedTemplateSupplements(@Req() req: AuthenticatedRequest) {
        return this.templateSupplementService.findArchivedTemplateSupplements(this.getHotelId(req));
    }

    @Post('supplements')
    createTemplateSupplement(
        @Req() req: AuthenticatedRequest,
        @Body() dto: CreateTemplateSupplementDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.templateSupplementService.createTemplateSupplement(this.getHotelId(req), dto, user);
    }

    @Patch('supplements/:id')
    updateTemplateSupplement(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateTemplateSupplementDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.templateSupplementService.updateTemplateSupplement(this.getHotelId(req), id, dto, user);
    }

    @Delete('supplements/:id')
    removeTemplateSupplement(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.templateSupplementService.removeTemplateSupplement(this.getHotelId(req), id);
    }

    @Patch('supplements/:id/restore')
    restoreTemplateSupplement(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.templateSupplementService.restoreTemplateSupplement(this.getHotelId(req), id);
    }
}
