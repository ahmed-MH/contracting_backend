import { Controller, Get, Post, Body, Param, ParseIntPipe, Headers } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { InitContractLineDto } from './dto/init-contract-line.dto';
import { SetPriceDto } from './dto/set-price.dto';
import { ManageLinePromosDto } from './dto/manage-line-promos.dto';
import { SetAllotmentDto } from './dto/set-allotment.dto';

import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';

@Controller('pricing')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class PricingController {
    constructor(private readonly pricingService: PricingService) { }

    // Initialize a contract line (Period × Room intersection)
    @Post('lines')
    initContractLine(@Headers('x-hotel-id') hotelId: string, @Body() dto: InitContractLineDto) {
        return this.pricingService.initContractLine(parseInt(hotelId, 10), dto);
    }

    // Set or update a price for a line × arrangement pair
    @Post('prices')
    setPrice(@Headers('x-hotel-id') hotelId: string, @Body() dto: SetPriceDto) {
        return this.pricingService.setPrice(parseInt(hotelId, 10), dto);
    }

    // Replace the promotions assigned to a contract line
    @Post('promotions')
    setLinePromotions(@Headers('x-hotel-id') hotelId: string, @Body() dto: ManageLinePromosDto) {
        return this.pricingService.setLinePromotions(parseInt(hotelId, 10), dto);
    }

    // Set or update the allotment for a contract line
    @Post('allotments')
    setAllotment(@Headers('x-hotel-id') hotelId: string, @Body() dto: SetAllotmentDto) {
        return this.pricingService.setAllotment(parseInt(hotelId, 10), dto);
    }

    // Get the full pricing matrix for a contract
    @Get('contract/:id')
    getMatrix(@Headers('x-hotel-id') hotelId: string, @Param('id', ParseIntPipe) id: number) {
        return this.pricingService.getMatrix(parseInt(hotelId, 10), id);
    }
}
