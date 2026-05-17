import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request.interface';
import { BillingService } from './billing.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

@Controller('billing')
@SkipHotelCheck()
export class BillingController {
    constructor(private readonly billingService: BillingService) { }

    @Post('checkout-session')
    @Roles(UserRole.SUPERVISOR)
    createCheckoutSession(@Body() dto: CreateCheckoutSessionDto, @CurrentUser() user: RequestUser) {
        return this.billingService.createCheckoutSession(dto, user);
    }

    @Post('webhook')
    @Public()
    @HttpCode(200)
    webhook(
        @Req() request: Request & { rawBody?: Buffer },
        @Headers('stripe-signature') signature?: string,
    ) {
        return this.billingService.handleWebhook(request.rawBody, signature);
    }
}
