import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query, Req } from '@nestjs/common';
import { TemplateSpoService } from './template-spo.service';
import { CreateTemplateSpoDto } from './dto/create-template-spo.dto';
import { UpdateTemplateSpoDto } from './dto/update-template-spo.dto';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';
import { Request } from 'express';

@Controller('hotel')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class TemplateSpoController {
    constructor(private readonly templateSpoService: TemplateSpoService) { }

    private getHotelId(req: Request): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    @Get('spos')
    findAllTemplateSpos(
        @Req() req: Request,
        @Query() pageOptions: PageOptionsDto,
    ) {
        return this.templateSpoService.findAllTemplateSpos(this.getHotelId(req), pageOptions);
    }

    @Get('spos/archived')
    findArchived(@Req() req: Request) {
        return this.templateSpoService.findArchivedTemplateSpos(this.getHotelId(req));
    }

    @Post('spos')
    createTemplateSpo(
        @Req() req: Request,
        @Body() dto: CreateTemplateSpoDto,
    ) {
        return this.templateSpoService.createTemplateSpo(this.getHotelId(req), dto);
    }

    @Patch('spos/:id')
    updateTemplateSpo(
        @Req() req: Request,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateTemplateSpoDto,
    ) {
        return this.templateSpoService.updateTemplateSpo(this.getHotelId(req), id, dto);
    }

    @Delete('spos/:id')
    removeTemplateSpo(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
        return this.templateSpoService.removeTemplateSpo(this.getHotelId(req), id);
    }

    @Patch('spos/:id/restore')
    restoreTemplateSpo(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
        return this.templateSpoService.restoreTemplateSpo(this.getHotelId(req), id);
    }
}
