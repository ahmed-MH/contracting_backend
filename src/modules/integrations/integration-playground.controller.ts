import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlanApiAccess } from '../../common/decorators/requires-plan-api-access.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PlanEntitlementsGuard } from '../../common/guards/plan-entitlements.guard';
import { AuthenticatedRequest, RequestUser } from '../../common/interfaces/request.interface';
import { IntegrationQuoteService } from './integration-quote.service';

type MutableJsonResponse = {
    setHeader: (name: string, value: string) => void;
    status: (statusCode: number) => { json: (payload: unknown) => void };
};

@Controller('admin/integrations/playground/reservations')
@Roles(UserRole.ADMIN)
@RequiresPlanApiAccess()
@UseGuards(PlanEntitlementsGuard)
export class IntegrationPlaygroundController {
    constructor(private readonly integrationQuoteService: IntegrationQuoteService) { }

    @Post('quote')
    async quote(
        @Body() body: unknown,
        @CurrentUser() user: RequestUser,
        @Req() req: AuthenticatedRequest,
        @Res() res: MutableJsonResponse,
    ) {
        const hotelContextId = Number(req.headers['x-hotel-id']);
        const forwardedFor = req.headers['x-forwarded-for'];
        const ipAddress = Array.isArray(forwardedFor)
            ? forwardedFor[0]
            : forwardedFor?.split(',')[0]?.trim() ?? req.ip ?? null;

        const result = await this.integrationQuoteService.handlePlaygroundQuote(
            body,
            user,
            hotelContextId,
            ipAddress,
        );

        res.setHeader('x-integration-endpoint-code', result.trace.endpointCode);
        res.setHeader('x-integration-source', result.trace.source);
        res.setHeader('x-integration-duration-ms', String(result.trace.durationMs));
        res.setHeader('x-integration-request-id', result.trace.requestId ?? '');
        res.setHeader('x-integration-error-code', result.trace.errorCode ?? '');

        res.status(result.statusCode).json(result.payload);
    }
}
