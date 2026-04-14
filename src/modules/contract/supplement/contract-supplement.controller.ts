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
import { ContractSupplementService } from './contract-supplement.service';
import { ImportSupplementDto } from './dto/import-supplement.dto';
import { UpdateContractSupplementDto } from './dto/update-contract-supplement.dto';

import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';
import { AuthenticatedRequest } from '../../../common/interfaces/request.interface';

@Controller('contracts/:contractId/supplements')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ContractSupplementController {
    constructor(
        private readonly supplementService: ContractSupplementService,
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
        return this.supplementService.findByContract(this.getHotelId(req), contractId);
    }

    @Post('import')
    importFromTemplate(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: ImportSupplementDto,
    ) {
        return this.supplementService.importFromTemplate(this.getHotelId(req), contractId, dto.templateId);
    }

    @Patch(':suppId')
    update(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Param('suppId', ParseIntPipe) suppId: number,
        @Body() dto: UpdateContractSupplementDto,
    ) {
        return this.supplementService.update(this.getHotelId(req), contractId, suppId, dto);
    }

    @Delete(':suppId')
    remove(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Param('suppId', ParseIntPipe) suppId: number,
    ) {
        return this.supplementService.remove(this.getHotelId(req), contractId, suppId);
    }
}
