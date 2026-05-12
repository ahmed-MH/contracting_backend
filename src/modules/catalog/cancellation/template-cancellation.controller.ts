import { Controller, Get, Post, Body, Param, Patch, Delete, ParseIntPipe, Query } from '@nestjs/common';
import { TemplateCancellationService } from './template-cancellation.service';
import { CreateTemplateCancellationRuleDto, UpdateTemplateCancellationRuleDto } from './dto/template-cancellation.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequestUser } from '../../../common/interfaces/request.interface';

@Controller('hotels/:hotelId/catalog/cancellation-rules')
@Roles(UserRole.COMMERCIAL)
export class TemplateCancellationController {
    constructor(private readonly service: TemplateCancellationService) { }

    @Post()
    create(@Param('hotelId', ParseIntPipe) hotelId: number, @Body() dto: CreateTemplateCancellationRuleDto, @CurrentUser() user?: RequestUser) {
        return this.service.createTemplateCancellationRule(hotelId, dto, user);
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    findAll(
        @Param('hotelId', ParseIntPipe) hotelId: number,
        @Query() pageOptions: PageOptionsDto
    ) {
        return this.service.findAll(hotelId, pageOptions);
    }

    @Get('archived')
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    findArchived(@Param('hotelId', ParseIntPipe) hotelId: number) {
        return this.service.findArchived(hotelId);
    }

    @Get(':id')
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    findOne(@Param('hotelId', ParseIntPipe) hotelId: number, @Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(hotelId, id);
    }

    @Patch(':id')
    update(@Param('hotelId', ParseIntPipe) hotelId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTemplateCancellationRuleDto, @CurrentUser() user?: RequestUser) {
        return this.service.update(hotelId, id, dto, user);
    }

    @Delete(':id')
    delete(@Param('hotelId', ParseIntPipe) hotelId: number, @Param('id', ParseIntPipe) id: number) {
        return this.service.delete(hotelId, id);
    }

    @Patch(':id/restore')
    restore(@Param('hotelId', ParseIntPipe) hotelId: number, @Param('id', ParseIntPipe) id: number) {
        return this.service.restore(hotelId, id);
    }
}
