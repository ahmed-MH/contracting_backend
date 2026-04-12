import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { UserRole } from '../../common/constants/enums';
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
    create(@Body() dto: CreatePlanDto) {
        return this.plansService.create(dto);
    }

    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlanDto) {
        return this.plansService.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.plansService.remove(id);
    }
}
