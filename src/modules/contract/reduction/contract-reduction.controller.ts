import { AuthenticatedRequest } from '../../../common/interfaces/request.interface';
import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    ParseIntPipe,
    Req,
} from '@nestjs/common';
import { ContractReductionService } from './contract-reduction.service';
import { ImportReductionDto } from './dto/import-reduction.dto';
import { UpdateContractReductionDto } from './dto/update-contract-reduction.dto';

import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';

@Controller('contracts/:contractId/reductions')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ContractReductionController {
    constructor(
        private readonly reductionService: ContractReductionService,
    ) { }

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
        return this.reductionService.findByContract(this.getHotelId(req), contractId);
    }

    @Post('import')
    importFromTemplate(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: ImportReductionDto,
    ) {
        return this.reductionService.importFromTemplate(
            this.getHotelId(req),
            contractId,
            dto.templateId,
        );
    }

    @Patch(':reductionId')
    update(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Param('reductionId', ParseIntPipe) reductionId: number,
        @Body() dto: UpdateContractReductionDto,
    ) {
        return this.reductionService.update(this.getHotelId(req), contractId, reductionId, dto);
    }

    @Delete(':reductionId')
    remove(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Param('reductionId', ParseIntPipe) reductionId: number,
    ) {
        return this.reductionService.remove(this.getHotelId(req), contractId, reductionId);
    }
}
