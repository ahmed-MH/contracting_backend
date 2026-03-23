import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ContractSpoService } from './contract-spo.service';
import { CreateContractSpoDto } from './dto/create-contract-spo.dto';
import { UpdateContractSpoDto } from './dto/update-contract-spo.dto';
import { ImportSpoDto } from './dto/import-spo.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';

@Controller('contracts/:contractId/spos')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ContractSpoController {
    constructor(private readonly contractSpoService: ContractSpoService) { }

    @Get()
    findAllByContract(@Param('contractId', ParseIntPipe) contractId: number) {
        return this.contractSpoService.findAllByContract(contractId);
    }

    @Post()
    createContractSpo(
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: CreateContractSpoDto,
    ) {
        return this.contractSpoService.createContractSpo(contractId, dto);
    }

    @Post('import')
    importFromTemplate(
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: ImportSpoDto,
    ) {
        return this.contractSpoService.importFromTemplate(contractId, dto);
    }

    @Patch(':id')
    updateContractSpo(
        @Param('contractId', ParseIntPipe) contractId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateContractSpoDto,
    ) {
        return this.contractSpoService.updateContractSpo(contractId, id, dto);
    }

    @Delete(':id')
    removeContractSpo(
        @Param('contractId', ParseIntPipe) contractId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.contractSpoService.removeContractSpo(contractId, id);
    }
}
