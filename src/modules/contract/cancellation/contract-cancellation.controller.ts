import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe, Req } from '@nestjs/common';
import { ContractCancellationService } from './contract-cancellation.service';
import { CreateContractCancellationRuleDto, UpdateContractCancellationRuleDto, ImportCancellationRuleDto } from './dto/contract-cancellation.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';
import { AuthenticatedRequest } from '../../../common/interfaces/request.interface';

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
    ) {
        return this.service.create(this.getHotelId(req), contractId, dto);
    }

    @Post('import')
    import(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: ImportCancellationRuleDto,
    ) {
        return this.service.importFromTemplate(this.getHotelId(req), contractId, dto);
    }

    @Put(':id')
    update(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateContractCancellationRuleDto,
    ) {
        return this.service.update(this.getHotelId(req), contractId, id, dto);
    }

    @Delete(':id')
    delete(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.delete(this.getHotelId(req), contractId, id);
    }
}
