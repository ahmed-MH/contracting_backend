import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Headers } from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import { CreateAffiliateDto } from './dto/create-affiliate.dto';
import { UpdateAffiliateDto } from './dto/update-affiliate.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request.interface';

@Controller('affiliates')
@Roles(UserRole.COMMERCIAL)
export class AffiliateController {
    constructor(private readonly affiliateService: AffiliateService) { }

    @Post()
    create(@Headers('x-hotel-id') hotelId: string, @Body() dto: CreateAffiliateDto, @CurrentUser() user?: RequestUser) {
        return this.affiliateService.create(parseInt(hotelId, 10), dto, user);
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.AGENT)
    findAll(@Headers('x-hotel-id') hotelId: string) {
        return this.affiliateService.findAll(parseInt(hotelId, 10));
    }

    @Get('archived')
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    findArchived(@Headers('x-hotel-id') hotelId: string) {
        return this.affiliateService.findArchived(parseInt(hotelId, 10));
    }

    @Get(':id/contracts')
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    getContracts(@Headers('x-hotel-id') hotelId: string, @Param('id', ParseIntPipe) id: number) {
        return this.affiliateService.getContractsForAffiliate(parseInt(hotelId, 10), id);
    }

    @Patch(':id')
    update(
        @Headers('x-hotel-id') hotelId: string,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateAffiliateDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.affiliateService.update(parseInt(hotelId, 10), id, dto, user);
    }

    @Delete(':id')
    remove(@Headers('x-hotel-id') hotelId: string, @Param('id', ParseIntPipe) id: number) {
        return this.affiliateService.remove(parseInt(hotelId, 10), id);
    }

    @Patch(':id/restore')
    restore(@Headers('x-hotel-id') hotelId: string, @Param('id', ParseIntPipe) id: number) {
        return this.affiliateService.restore(parseInt(hotelId, 10), id);
    }
}
