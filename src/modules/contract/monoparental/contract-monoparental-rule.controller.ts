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
import { ContractMonoparentalRuleService } from './contract-monoparental-rule.service';
import { ImportMonoparentalRuleDto } from './dto/import-monoparental-rule.dto';
import { UpdateContractMonoparentalRuleDto } from './dto/update-contract-monoparental-rule.dto';

import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';
import { Request } from 'express';

@Controller('contracts/:contractId/monoparental-rules')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ContractMonoparentalRuleController {
    constructor(
        private readonly monoparentalService: ContractMonoparentalRuleService,
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
        return this.monoparentalService.findByContract(contractId);
    }

    @Post('import')
    importFromTemplate(
        @Req() req: Request,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: ImportMonoparentalRuleDto,
    ) {
        return this.monoparentalService.importFromTemplate(
            contractId,
            dto.templateId,
            this.getHotelId(req),
        );
    }

    @Patch(':ruleId')
    update(
        @Param('ruleId', ParseIntPipe) ruleId: number,
        @Body() dto: UpdateContractMonoparentalRuleDto,
    ) {
        return this.monoparentalService.update(ruleId, dto);
    }

    @Delete(':ruleId')
    remove(@Param('ruleId', ParseIntPipe) ruleId: number) {
        return this.monoparentalService.remove(ruleId);
    }
}
