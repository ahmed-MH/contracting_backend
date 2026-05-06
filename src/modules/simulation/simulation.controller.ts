import { Body, Controller, ForbiddenException, Get, Headers, Post, Query, Request } from '@nestjs/common';
import { SimulationService } from './simulation.service';
import { SimulationRequestDto } from './dto/simulation-request.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { SimulationContractMatcherService } from './simulation-contract-matcher.service';
import { SimulationContractMatchQueryDto } from './dto/simulation-contract-match.dto';
import { RequestUser } from '../../common/interfaces/request.interface';

@Controller('simulation')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class SimulationController {
    constructor(
        private readonly simulationService: SimulationService,
        private readonly contractMatcher: SimulationContractMatcherService,
    ) { }

    @Get('contracts/matches')
    matchContracts(
        @Headers('x-hotel-id') hotelId: string,
        @Query() dto: SimulationContractMatchQueryDto,
        @Request() req: { user: RequestUser },
    ) {
        this.assertInactiveOverridePermission(Boolean(dto.includeInactive), req.user);
        return this.contractMatcher.match({
            hotelId: parseInt(hotelId, 10),
            affiliateId: dto.affiliateId,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            includeInactive: dto.includeInactive,
        });
    }

    @Post('calculate')
    calculate(@Headers('x-hotel-id') hotelId: string, @Body() dto: SimulationRequestDto, @Request() req: { user: RequestUser }) {
        return this.simulationService.calculate(parseInt(hotelId, 10), dto, req.user);
    }

    private assertInactiveOverridePermission(includeInactive: boolean, user: RequestUser): void {
        if (!includeInactive) return;
        if (user.role === UserRole.ADMIN || user.role === UserRole.COMMERCIAL) return;
        throw new ForbiddenException('You are not allowed to include inactive contracts in simulation.');
    }
}
