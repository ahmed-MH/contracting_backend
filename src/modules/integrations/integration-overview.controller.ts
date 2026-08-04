import { Controller, Get } from '@nestjs/common';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { RequestUser } from '../../common/interfaces/request.interface';
import { IntegrationOverviewService } from './integration-overview.service';

@Controller('admin/integrations/overview')
@Roles(UserRole.ADMIN)
@SkipHotelCheck()
export class IntegrationOverviewController {
    constructor(private readonly overviewService: IntegrationOverviewService) { }

    @Get()
    getOverview(@CurrentUser() user: RequestUser): Promise<unknown> {
        return this.overviewService.getOverview(user);
    }
}
