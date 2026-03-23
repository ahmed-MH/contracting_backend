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
import { Request } from 'express';

@Controller('contracts/:contractId/reductions')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ContractReductionController {
    constructor(
        private readonly reductionService: ContractReductionService,
    ) { }

    private getHotelId(req: Request): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    @Get()
    findAll(@Param('contractId', ParseIntPipe) contractId: number) {
        return this.reductionService.findByContract(contractId);
    }

    @Post('import')
    importFromTemplate(
        @Req() req: Request,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: ImportReductionDto,
    ) {
        return this.reductionService.importFromTemplate(
            contractId,
            dto.templateId,
            this.getHotelId(req),
        );
    }

    @Patch(':reductionId')
    update(
        @Param('reductionId', ParseIntPipe) reductionId: number,
        @Body() dto: UpdateContractReductionDto,
    ) {
        return this.reductionService.update(reductionId, dto);
    }

    @Delete(':reductionId')
    remove(@Param('reductionId', ParseIntPipe) reductionId: number) {
        return this.reductionService.remove(reductionId);
    }
}
