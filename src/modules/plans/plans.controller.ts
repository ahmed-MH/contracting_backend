import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request.interface';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlansService } from './plans.service';

@Controller('plans')
@Roles(UserRole.SUPERVISOR)
@SkipHotelCheck()
export class PlansController {
    constructor(private readonly plansService: PlansService) { }

    @Get()
    findAll() {
        return this.plansService.findAll();
    }

    @Post()
    create(@Body() dto: CreatePlanDto, @CurrentUser() user: RequestUser) {
        return this.plansService.create(dto, user);
    }

    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlanDto, @CurrentUser() user: RequestUser) {
        return this.plansService.update(id, dto, user);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
        return this.plansService.remove(id, user);
    }
}
