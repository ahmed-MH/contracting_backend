import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import { CreateAffiliateDto } from './dto/create-affiliate.dto';
import { UpdateAffiliateDto } from './dto/update-affiliate.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';

@Controller('affiliates')
export class AffiliateController {
    constructor(private readonly affiliateService: AffiliateService) { }

    @Post()
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    create(@Body() dto: CreateAffiliateDto) {
        return this.affiliateService.create(dto);
    }

    @Get()
    findAll() {
        return this.affiliateService.findAll();
    }

    @Get('archived')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    findArchived() {
        return this.affiliateService.findArchived();
    }

    @Patch(':id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateAffiliateDto,
    ) {
        return this.affiliateService.update(id, dto);
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.affiliateService.remove(id);
    }

    @Patch(':id/restore')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    restore(@Param('id', ParseIntPipe) id: number) {
        return this.affiliateService.restore(id);
    }
}
