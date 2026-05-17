import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '../constants/enums';
import { Roles } from '../decorators/roles.decorator';
import { SkipHotelCheck } from '../decorators/skip-hotel-check.decorator';
import { AuditService } from './audit.service';
import { ListAuditLogsQuery } from './audit.types';

@Controller('system-logs')
@Roles(UserRole.SUPERVISOR)
@SkipHotelCheck()
export class SystemLogsController {
    constructor(private readonly auditService: AuditService) { }

    @Get()
    list(@Query() query: ListAuditLogsQuery) {
        return this.auditService.list(query);
    }
}
