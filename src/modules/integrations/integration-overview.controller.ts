import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlanApiAccess } from '../../common/decorators/requires-plan-api-access.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { PlanEntitlementsGuard } from '../../common/guards/plan-entitlements.guard';
import { RequestUser } from '../../common/interfaces/request.interface';
import { IntegrationOverviewService } from './integration-overview.service';

@Controller('admin/integrations/overview')
@Roles(UserRole.ADMIN)
@SkipHotelCheck()
@RequiresPlanApiAccess()
@UseGuards(PlanEntitlementsGuard)
export class IntegrationOverviewController {
    constructor(private readonly overviewService: IntegrationOverviewService) { }

    @Get()
    getOverview(@CurrentUser() user: RequestUser): Promise<unknown> {
        return this.overviewService.getOverview(user);
    }
}
