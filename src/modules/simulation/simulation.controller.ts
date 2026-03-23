import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SimulationService } from './simulation.service';
import { SimulationRequestDto } from './dto/simulation-request.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';

@Controller('simulation')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class SimulationController {
    constructor(private readonly simulationService: SimulationService) { }

    @Post('calculate')
    calculate(@Body() dto: SimulationRequestDto) {
        return this.simulationService.calculate(dto);
    }
}
