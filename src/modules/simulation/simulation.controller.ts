import { Controller, Post, Body, Headers } from '@nestjs/common';
import { SimulationService } from './simulation.service';
import { SimulationRequestDto } from './dto/simulation-request.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';

@Controller('simulation')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class SimulationController {
    constructor(private readonly simulationService: SimulationService) { }

    @Post('calculate')
    calculate(@Headers('x-hotel-id') hotelId: string, @Body() dto: SimulationRequestDto) {
        return this.simulationService.calculate(parseInt(hotelId, 10), dto);
    }
}
