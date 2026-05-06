import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe, Req } from '@nestjs/common';
import { ContractCancellationService } from './contract-cancellation.service';
import { CreateContractCancellationRuleDto, UpdateContractCancellationRuleDto, ImportCancellationRuleDto } from './dto/contract-cancellation.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { UserRole } from '../../../common/constants/enums';
import { AuthenticatedRequest } from '../../../common/interfaces/request.interface';
import { RequestUser } from '../../../common/interfaces/request.interface';

@Controller('contracts/:contractId/cancellation-rules')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ContractCancellationController {
    constructor(private readonly service: ContractCancellationService) { }

    private getHotelId(req: AuthenticatedRequest): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    @Get()
    findAll(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
    ) {
        return this.service.findAllByContract(this.getHotelId(req), contractId);
    }

    @Post()
    create(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: CreateContractCancellationRuleDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.service.create(this.getHotelId(req), contractId, dto, user);
    }

    @Post('import')
    import(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: ImportCancellationRuleDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.service.importFromTemplate(this.getHotelId(req), contractId, dto, user);
    }

    @Put(':id')
    update(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateContractCancellationRuleDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.service.update(this.getHotelId(req), contractId, id, dto, user);
    }

    @Delete(':id')
    delete(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Param('id', ParseIntPipe) id: number,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.service.delete(this.getHotelId(req), contractId, id, user);
    }
}
