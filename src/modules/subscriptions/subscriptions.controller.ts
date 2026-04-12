import { Body, Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { UserRole } from '../../common/constants/enums';
import { UpdateSubscriptionStatusDto } from './dto/update-subscription-status.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@Roles(UserRole.SUPERVISOR)
@SkipHotelCheck()
export class SubscriptionsController {
    constructor(private readonly subscriptionsService: SubscriptionsService) { }

    @Get()
    findAll() {
        return this.subscriptionsService.findAll();
    }

    @Get('summary')
    getSummary() {
        return this.subscriptionsService.getSummary();
    }

    @Patch(':id/status')
    updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSubscriptionStatusDto) {
        return this.subscriptionsService.updateStatus(id, dto);
    }
}
