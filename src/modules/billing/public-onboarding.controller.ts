import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { BillingService } from './billing.service';
import { CreatePublicOnboardingCheckoutSessionDto } from './dto/create-public-onboarding-checkout-session.dto';

@Controller('public/onboarding')
@Public()
@SkipHotelCheck()
export class PublicOnboardingController {
    constructor(private readonly billingService: BillingService) { }

    @Post('checkout-session')
    createCheckoutSession(@Body() dto: CreatePublicOnboardingCheckoutSessionDto) {
        return this.billingService.createPublicOnboardingCheckoutSession(dto);
    }
}
