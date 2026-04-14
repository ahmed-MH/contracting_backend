import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { ContractSpoService } from './contract-spo.service';
import { CreateContractSpoDto } from './dto/create-contract-spo.dto';
import { UpdateContractSpoDto } from './dto/update-contract-spo.dto';
import { ImportSpoDto } from './dto/import-spo.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';
import { AuthenticatedRequest } from '../../../common/interfaces/request.interface';

@Controller('contracts/:contractId/spos')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ContractSpoController {
    constructor(private readonly contractSpoService: ContractSpoService) { }

    private getHotelId(req: AuthenticatedRequest): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    @Get()
    findAllByContract(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
    ) {
        return this.contractSpoService.findAllByContract(this.getHotelId(req), contractId);
    }

    @Post()
    createContractSpo(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: CreateContractSpoDto,
    ) {
        return this.contractSpoService.createContractSpo(this.getHotelId(req), contractId, dto);
    }

    @Post('import')
    importFromTemplate(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: ImportSpoDto,
    ) {
        return this.contractSpoService.importFromTemplate(this.getHotelId(req), contractId, dto);
    }

    @Patch(':id')
    updateContractSpo(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateContractSpoDto,
    ) {
        return this.contractSpoService.updateContractSpo(this.getHotelId(req), contractId, id, dto);
    }

    @Delete(':id')
    removeContractSpo(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.contractSpoService.removeContractSpo(this.getHotelId(req), contractId, id);
    }
}
