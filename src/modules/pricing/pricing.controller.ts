import { Controller, Get, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { InitContractLineDto } from './dto/init-contract-line.dto';
import { SetPriceDto } from './dto/set-price.dto';
import { ManageLinePromosDto } from './dto/manage-line-promos.dto';
import { SetAllotmentDto } from './dto/set-allotment.dto';

@Controller('pricing')
export class PricingController {
    constructor(private readonly pricingService: PricingService) { }

    // Initialize a contract line (Period × Room intersection)
    @Post('lines')
    initContractLine(@Body() dto: InitContractLineDto) {
        return this.pricingService.initContractLine(dto);
    }

    // Set or update a price for a line × arrangement pair
    @Post('prices')
    setPrice(@Body() dto: SetPriceDto) {
        return this.pricingService.setPrice(dto);
    }

    // Replace the promotions assigned to a contract line
    @Post('promotions')
    setLinePromotions(@Body() dto: ManageLinePromosDto) {
        return this.pricingService.setLinePromotions(dto);
    }

    // Set or update the allotment for a contract line
    @Post('allotments')
    setAllotment(@Body() dto: SetAllotmentDto) {
        return this.pricingService.setAllotment(dto);
    }

    // Get the full pricing matrix for a contract
    @Get('contract/:id')
    getMatrix(@Param('id', ParseIntPipe) id: number) {
        return this.pricingService.getMatrix(id);
    }
}
