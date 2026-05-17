import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request.interface';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { SetupMyOrganizationDto } from './dto/setup-my-organization.dto';

@Controller('tenants')
@Roles(UserRole.SUPERVISOR)
@SkipHotelCheck()
export class TenantsController {
    constructor(private readonly tenantsService: TenantsService) { }

    @Post()
    create(@Body() dto: CreateTenantDto, @CurrentUser() user: RequestUser) {
        return this.tenantsService.create(dto, user);
    }

    @Post('setup-my-organization')
    @Roles(UserRole.ADMIN)
    setupMyOrganization(
        @CurrentUser() user: RequestUser,
        @Body() dto: SetupMyOrganizationDto,
    ) {
        return this.tenantsService.setupMyOrganization(user, dto);
    }

    @Get()
    findAll() {
        return this.tenantsService.findAll();
    }

    @Patch(':id/suspend')
    suspend(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
        return this.tenantsService.suspend(id, user);
    }

    @Patch(':id/reactivate')
    reactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
        return this.tenantsService.reactivate(id, user);
    }
}
