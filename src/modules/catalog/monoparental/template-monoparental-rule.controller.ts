import { AuthenticatedRequest } from '../../../common/interfaces/request.interface';
import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query, Req } from '@nestjs/common';
import { TemplateMonoparentalRuleService } from './template-monoparental-rule.service';
import { CreateTemplateMonoparentalRuleDto } from './dto/create-template-monoparental-rule.dto';
import { UpdateTemplateMonoparentalRuleDto } from './dto/update-template-monoparental-rule.dto';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';
import { Request } from 'express';

@Controller('hotel')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class TemplateMonoparentalRuleController {
    constructor(private readonly templateMonoparentalRuleService: TemplateMonoparentalRuleService) { }

    private getHotelId(req: AuthenticatedRequest): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    @Get('monoparental-rules')
    findAllTemplateMonoparentalRules(
        @Req() req: AuthenticatedRequest,
        @Query() pageOptions: PageOptionsDto,
    ) {
        return this.templateMonoparentalRuleService.findAllTemplateMonoparentalRules(this.getHotelId(req), pageOptions);
    }

    @Get('monoparental-rules/archived')
    findArchivedTemplateMonoparentalRules(@Req() req: AuthenticatedRequest) {
        return this.templateMonoparentalRuleService.findArchivedTemplateMonoparentalRules(this.getHotelId(req));
    }

    @Post('monoparental-rules')
    createTemplateMonoparentalRule(
        @Req() req: AuthenticatedRequest,
        @Body() dto: CreateTemplateMonoparentalRuleDto,
    ) {
        return this.templateMonoparentalRuleService.createTemplateMonoparentalRule(this.getHotelId(req), dto);
    }

    @Patch('monoparental-rules/:id')
    updateTemplateMonoparentalRule(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateTemplateMonoparentalRuleDto,
    ) {
        return this.templateMonoparentalRuleService.updateTemplateMonoparentalRule(this.getHotelId(req), id, dto);
    }

    @Delete('monoparental-rules/:id')
    removeTemplateMonoparentalRule(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.templateMonoparentalRuleService.removeTemplateMonoparentalRule(this.getHotelId(req), id);
    }

    @Patch('monoparental-rules/:id/restore')
    restoreTemplateMonoparentalRule(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.templateMonoparentalRuleService.restoreTemplateMonoparentalRule(this.getHotelId(req), id);
    }
}
