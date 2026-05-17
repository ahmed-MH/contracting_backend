import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { UserRole } from '../../common/constants/enums';
import { BillingService } from './billing.service';
import { ListPublicSignupsQueryDto } from './dto/list-public-signups-query.dto';

@Controller('public-signups')
@Roles(UserRole.SUPERVISOR)
@SkipHotelCheck()
export class PublicSignupsController {
    constructor(private readonly billingService: BillingService) { }

    @Get()
    findAll(@Query() query: ListPublicSignupsQueryDto) {
        return this.billingService.listPublicSignups(query);
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.billingService.getPublicSignup(id);
    }
}
