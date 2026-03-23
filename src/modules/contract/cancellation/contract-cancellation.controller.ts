import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe } from '@nestjs/common';
import { ContractCancellationService } from './contract-cancellation.service';
import { CreateContractCancellationRuleDto, UpdateContractCancellationRuleDto, ImportCancellationRuleDto } from './dto/contract-cancellation.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';

@Controller('contracts/:contractId/cancellation-rules')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ContractCancellationController {
    constructor(private readonly service: ContractCancellationService) { }

    @Get()
    findAll(@Param('contractId', ParseIntPipe) contractId: number) {
        return this.service.findAllByContract(contractId);
    }

    @Post()
    create(@Param('contractId', ParseIntPipe) contractId: number, @Body() dto: CreateContractCancellationRuleDto) {
        return this.service.create(contractId, dto);
    }

    @Post('import')
    import(@Param('contractId', ParseIntPipe) contractId: number, @Body() dto: ImportCancellationRuleDto) {
        return this.service.importFromTemplate(contractId, dto);
    }

    @Put(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateContractCancellationRuleDto) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    delete(@Param('id', ParseIntPipe) id: number) {
        return this.service.delete(id);
    }
}
