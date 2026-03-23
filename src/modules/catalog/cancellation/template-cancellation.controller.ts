import { Controller, Get, Post, Body, Param, Patch, Delete, ParseIntPipe, Query } from '@nestjs/common';
import { TemplateCancellationService } from './template-cancellation.service';
import { CreateTemplateCancellationRuleDto, UpdateTemplateCancellationRuleDto } from './dto/template-cancellation.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';

@Controller('hotels/:hotelId/catalog/cancellation-rules')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class TemplateCancellationController {
    constructor(private readonly service: TemplateCancellationService) { }

    @Post()
    create(@Param('hotelId', ParseIntPipe) hotelId: number, @Body() dto: CreateTemplateCancellationRuleDto) {
        return this.service.createTemplateCancellationRule(hotelId, dto);
    }

    @Get()
    findAll(
        @Param('hotelId', ParseIntPipe) hotelId: number,
        @Query() pageOptions: PageOptionsDto
    ) {
        return this.service.findAll(hotelId, pageOptions);
    }

    @Get('archived')
    findArchived(@Param('hotelId', ParseIntPipe) hotelId: number) {
        return this.service.findArchived(hotelId);
    }

    @Get(':id')
    findOne(@Param('hotelId', ParseIntPipe) hotelId: number, @Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(hotelId, id);
    }

    @Patch(':id')
    update(@Param('hotelId', ParseIntPipe) hotelId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTemplateCancellationRuleDto) {
        return this.service.update(hotelId, id, dto);
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
