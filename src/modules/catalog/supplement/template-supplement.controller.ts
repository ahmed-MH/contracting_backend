import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query, Req } from '@nestjs/common';
import { TemplateSupplementService } from './template-supplement.service';
import { CreateTemplateSupplementDto } from './dto/create-template-supplement.dto';
import { UpdateTemplateSupplementDto } from './dto/update-template-supplement.dto';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';
import { Request } from 'express';

@Controller('hotel')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class TemplateSupplementController {
    constructor(private readonly templateSupplementService: TemplateSupplementService) { }

    private getHotelId(req: Request): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    @Get('supplements')
    findAllTemplateSupplements(
        @Req() req: Request,
        @Query() pageOptions: PageOptionsDto,
    ) {
        return this.templateSupplementService.findAllTemplateSupplements(this.getHotelId(req), pageOptions);
    }

    @Get('supplements/archived')
    findArchivedTemplateSupplements(@Req() req: Request) {
        return this.templateSupplementService.findArchivedTemplateSupplements(this.getHotelId(req));
    }

    @Post('supplements')
    createTemplateSupplement(
        @Req() req: Request,
        @Body() dto: CreateTemplateSupplementDto,
    ) {
        return this.templateSupplementService.createTemplateSupplement(this.getHotelId(req), dto);
    }

    @Patch('supplements/:id')
    updateTemplateSupplement(
        @Req() req: Request,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateTemplateSupplementDto,
    ) {
        return this.templateSupplementService.updateTemplateSupplement(this.getHotelId(req), id, dto);
    }

    @Delete('supplements/:id')
    removeTemplateSupplement(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
        return this.templateSupplementService.removeTemplateSupplement(this.getHotelId(req), id);
    }

    @Patch('supplements/:id/restore')
    restoreTemplateSupplement(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
        return this.templateSupplementService.restoreTemplateSupplement(this.getHotelId(req), id);
    }
}
