import {
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Body,
} from '@nestjs/common';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { RequestUser } from '../../common/interfaces/request.interface';
import { UpdateIntegrationEndpointDto } from './dto/integration-endpoint.dto';
import { IntegrationEndpointsService } from './integration-endpoints.service';

@Controller('integrations/endpoints')
@Roles(UserRole.ADMIN)
@SkipHotelCheck()
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
