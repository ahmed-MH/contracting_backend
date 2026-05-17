import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlanApiAccess } from '../../common/decorators/requires-plan-api-access.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { PlanEntitlementsGuard } from '../../common/guards/plan-entitlements.guard';
import { RequestUser } from '../../common/interfaces/request.interface';
import { IntegrationUsageLogQueryDto } from './dto/integration-usage-log.dto';
import { IntegrationApiUsageLogsService } from './integration-api-usage-logs.service';

@Controller('integrations/usage-logs')
@Roles(UserRole.ADMIN)
@SkipHotelCheck()
@RequiresPlanApiAccess()
@UseGuards(PlanEntitlementsGuard)
export class IntegrationUsageLogsController {
    constructor(private readonly usageLogsService: IntegrationApiUsageLogsService) { }

    @Get()
    findAll(@CurrentUser() user: RequestUser, @Query() query: IntegrationUsageLogQueryDto) {
        return this.usageLogsService.findAll(user, query);
    }
}
