import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { UserRole } from '../../../common/constants/enums';
import { RequestUser } from '../../../common/interfaces/request.interface';
import { CreateAffiliateEmailSpoDto } from './dto/create-affiliate-email-spo.dto';
import { BulkCreateAffiliateEmailSpoDto } from './dto/bulk-create-affiliate-email-spo.dto';
import { UpdateAffiliateEmailSpoDto } from './dto/update-affiliate-email-spo.dto';
import { AffiliateEmailSpoService } from './affiliate-email-spo.service';

@Controller('affiliates/email-spo')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class AffiliateEmailSpoBulkController {
    constructor(private readonly affiliateEmailSpoService: AffiliateEmailSpoService) {}

    @Post('bulk')
    createBulk(
        @Headers('x-hotel-id') hotelId: string,
        @Body() dto: BulkCreateAffiliateEmailSpoDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.affiliateEmailSpoService.createBulk(parseInt(hotelId, 10), dto, user);
    }
}

@Controller('affiliates/:affiliateId/email-spo')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class AffiliateEmailSpoController {
    constructor(private readonly affiliateEmailSpoService: AffiliateEmailSpoService) {}

    @Get()
    findAll(
        @Headers('x-hotel-id') hotelId: string,
        @Param('affiliateId', ParseIntPipe) affiliateId: number,
    ) {
        return this.affiliateEmailSpoService.findAll(parseInt(hotelId, 10), affiliateId);
    }

    @Post()
    create(
        @Headers('x-hotel-id') hotelId: string,
        @Param('affiliateId', ParseIntPipe) affiliateId: number,
        @Body() dto: CreateAffiliateEmailSpoDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.affiliateEmailSpoService.create(parseInt(hotelId, 10), affiliateId, dto, user);
    }

    @Patch(':emailSpoId')
    update(
        @Headers('x-hotel-id') hotelId: string,
        @Param('affiliateId', ParseIntPipe) affiliateId: number,
        @Param('emailSpoId', ParseIntPipe) emailSpoId: number,
        @Body() dto: UpdateAffiliateEmailSpoDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.affiliateEmailSpoService.update(parseInt(hotelId, 10), affiliateId, emailSpoId, dto, user);
    }

    @Delete(':emailSpoId')
    remove(
        @Headers('x-hotel-id') hotelId: string,
        @Param('affiliateId', ParseIntPipe) affiliateId: number,
        @Param('emailSpoId', ParseIntPipe) emailSpoId: number,
    ) {
        return this.affiliateEmailSpoService.remove(parseInt(hotelId, 10), affiliateId, emailSpoId);
    }
}
