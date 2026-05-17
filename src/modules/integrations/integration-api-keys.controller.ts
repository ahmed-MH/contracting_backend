import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlanApiAccess } from '../../common/decorators/requires-plan-api-access.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { PlanEntitlementsGuard } from '../../common/guards/plan-entitlements.guard';
import { RequestUser } from '../../common/interfaces/request.interface';
import { CreateIntegrationApiKeyDto, RotateIntegrationApiKeyDto, UpdateIntegrationApiKeyDto } from './dto/integration-api-key.dto';
import { IntegrationApiKeysService } from './integration-api-keys.service';

@Controller('integrations/api-keys')
@Roles(UserRole.ADMIN)
@SkipHotelCheck()
@RequiresPlanApiAccess()
@UseGuards(PlanEntitlementsGuard)
export class IntegrationApiKeysController {
    constructor(private readonly apiKeysService: IntegrationApiKeysService) { }

    @Get()
    findAll(@CurrentUser() user: RequestUser) {
        return this.apiKeysService.findAllForTenant(user.tenantId ?? null);
    }

    @Post()
    create(@Body() dto: CreateIntegrationApiKeyDto, @CurrentUser() user: RequestUser) {
        return this.apiKeysService.create(dto, user);
    }

    @Patch(':id')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateIntegrationApiKeyDto,
        @CurrentUser() user: RequestUser,
    ) {
        return this.apiKeysService.update(id, dto, user);
    }

    @Post(':id/rotate')
    rotate(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: RotateIntegrationApiKeyDto,
        @CurrentUser() user: RequestUser,
    ) {
        return this.apiKeysService.rotate(id, dto, user);
    }

    @Patch(':id/revoke')
    revoke(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
        return this.apiKeysService.revoke(id, user);
    }
}
