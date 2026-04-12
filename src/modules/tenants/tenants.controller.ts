import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Controller('tenants')
@Roles(UserRole.SUPERVISOR)
@SkipHotelCheck()
export class TenantsController {
    constructor(private readonly tenantsService: TenantsService) { }

    @Post()
    create(@Body() dto: CreateTenantDto) {
        return this.tenantsService.create(dto);
    }

    @Get()
    findAll() {
        return this.tenantsService.findAll();
    }

    @Patch(':id/suspend')
    suspend(@Param('id', ParseIntPipe) id: number) {
        return this.tenantsService.suspend(id);
    }
}
