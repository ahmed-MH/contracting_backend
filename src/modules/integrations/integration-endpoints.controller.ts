import {
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Body,
    UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlanApiAccess } from '../../common/decorators/requires-plan-api-access.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { PlanEntitlementsGuard } from '../../common/guards/plan-entitlements.guard';
import { RequestUser } from '../../common/interfaces/request.interface';
import { UpdateIntegrationEndpointDto } from './dto/integration-endpoint.dto';
import { IntegrationEndpointsService } from './integration-endpoints.service';

@Controller('integrations/endpoints')
@Roles(UserRole.ADMIN)
@SkipHotelCheck()
@RequiresPlanApiAccess()
@UseGuards(PlanEntitlementsGuard)
export class IntegrationEndpointsController {
    constructor(private readonly endpointsService: IntegrationEndpointsService) { }

    @Get()
    findAll(@CurrentUser() user: RequestUser) {
        return this.endpointsService.findAllForTenant(user);
    }

    @Patch(':id')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateIntegrationEndpointDto,
        @CurrentUser() user: RequestUser,
    ) {
        return this.endpointsService.update(id, dto, user);
    }
}
