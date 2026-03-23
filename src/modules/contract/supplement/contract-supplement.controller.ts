import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    ParseIntPipe,
} from '@nestjs/common';
import { ContractSupplementService } from './contract-supplement.service';
import { ImportSupplementDto } from './dto/import-supplement.dto';
import { UpdateContractSupplementDto } from './dto/update-contract-supplement.dto';

import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';

@Controller('contracts/:contractId/supplements')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ContractSupplementController {
    constructor(
        private readonly supplementService: ContractSupplementService,
    ) { }

    @Get()
    findAll(@Param('contractId', ParseIntPipe) contractId: number) {
        return this.supplementService.findByContract(contractId);
    }

    @Post('import')
    importFromTemplate(
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: ImportSupplementDto,
    ) {
        return this.supplementService.importFromTemplate(contractId, dto.templateId);
    }

    @Patch(':suppId')
    update(
        @Param('suppId', ParseIntPipe) suppId: number,
        @Body() dto: UpdateContractSupplementDto,
    ) {
        return this.supplementService.update(suppId, dto);
    }

    @Delete(':suppId')
    remove(@Param('suppId', ParseIntPipe) suppId: number) {
        return this.supplementService.remove(suppId);
    }
}
