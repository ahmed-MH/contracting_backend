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
import { ContractMonoparentalRuleService } from './contract-monoparental-rule.service';
import { ImportMonoparentalRuleDto } from './dto/import-monoparental-rule.dto';
import { UpdateContractMonoparentalRuleDto } from './dto/update-contract-monoparental-rule.dto';

import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { UserRole } from '../../../common/constants/enums';
import { RequestUser } from '../../../common/interfaces/request.interface';

@Controller('contracts/:contractId/monoparental-rules')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ContractMonoparentalRuleController {
    constructor(
        private readonly monoparentalService: ContractMonoparentalRuleService,
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
        return this.monoparentalService.findByContract(this.getHotelId(req), contractId);
    }

    @Post('import')
    importFromTemplate(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Body() dto: ImportMonoparentalRuleDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.monoparentalService.importFromTemplate(
            this.getHotelId(req),
            contractId,
            dto.templateId,
            user,
        );
    }

    @Patch(':ruleId')
    update(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Param('ruleId', ParseIntPipe) ruleId: number,
        @Body() dto: UpdateContractMonoparentalRuleDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.monoparentalService.update(this.getHotelId(req), contractId, ruleId, dto, user);
    }

    @Delete(':ruleId')
    remove(
        @Req() req: AuthenticatedRequest,
        @Param('contractId', ParseIntPipe) contractId: number,
        @Param('ruleId', ParseIntPipe) ruleId: number,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.monoparentalService.remove(this.getHotelId(req), contractId, ruleId, user);
    }
}
