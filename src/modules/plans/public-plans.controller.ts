import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { PlansService } from './plans.service';

@Controller('public/plans')
@Public()
@SkipHotelCheck()
export class PublicPlansController {
    constructor(private readonly plansService: PlansService) { }

    @Get()
    findActivePlans() {
        return this.plansService.findActivePublicPlans();
    }
}
