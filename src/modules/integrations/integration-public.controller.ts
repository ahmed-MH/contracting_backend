import { Body, Controller, Headers, Post, Req, Res } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { IntegrationQuoteService } from './integration-quote.service';

@Controller('v1/reservations')
@Public()
export class IntegrationPublicController {
    constructor(private readonly integrationQuoteService: IntegrationQuoteService) { }

    @Post('quote')
    @Public()
    @Roles()
    async quote(
        @Body() body: unknown,
        @Headers('x-api-key') apiKey: string | undefined,
        @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> },
        @Res() res: { status: (statusCode: number) => { json: (payload: unknown) => void } },
    ) {
        const forwardedFor = req.headers['x-forwarded-for'];
        const ipAddress = Array.isArray(forwardedFor)
            ? forwardedFor[0]
            : forwardedFor?.split(',')[0]?.trim() ?? req.ip ?? null;

        const result = await this.integrationQuoteService.handleQuote(body, apiKey, ipAddress);
        res.status(result.statusCode).json(result.payload);
    }
}
