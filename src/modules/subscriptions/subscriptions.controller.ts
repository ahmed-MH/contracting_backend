import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { AllowSuspendedTenant } from '../../common/decorators/allow-suspended-tenant.decorator';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request.interface';
import { BillingService } from '../billing/billing.service';
import { AssignPlanDto } from './dto/assign-plan.dto';
import { CreateTenantCheckoutSessionDto } from './dto/create-tenant-checkout-session.dto';
import { UpdateSubscriptionStatusDto } from './dto/update-subscription-status.dto';
import { SubscriptionsService } from './subscriptions.service';
import { TenantUsageService } from './tenant-usage.service';

@Controller('subscriptions')
@Roles(UserRole.SUPERVISOR)
@SkipHotelCheck()
export class SubscriptionsController {
    constructor(
        private readonly subscriptionsService: SubscriptionsService,
        private readonly tenantUsageService: TenantUsageService,
        private readonly billingService: BillingService,
    ) { }

    @Get()
    findAll() {
        return this.subscriptionsService.findAll();
    }

    @Get('summary')
    getSummary() {
        return this.subscriptionsService.getSummary();
    }

    @Get('usage')
    @AllowSuspendedTenant()
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.AGENT)
    getCurrentTenantUsage(@CurrentUser() user: RequestUser) {
        return this.tenantUsageService.getCurrentUserUsage(user.id);
    }

    @Get('current')
    @AllowSuspendedTenant()
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.AGENT)
    getCurrentSubscription(@CurrentUser() user: RequestUser) {
        return this.tenantUsageService.getCurrentUserUsage(user.id);
    }

    @Get('available-plans')
    @AllowSuspendedTenant()
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.AGENT)
    getAvailablePlans() {
        return this.subscriptionsService.findAvailablePlans();
    }

    @Post('checkout-session')
    @AllowSuspendedTenant()
    @Roles(UserRole.ADMIN)
    createTenantCheckoutSession(
        @CurrentUser() user: RequestUser,
        @Body() dto: CreateTenantCheckoutSessionDto,
    ) {
        return this.billingService.createTenantAdminCheckoutSession(user, dto);
    }

    @Post('sync-checkout')
    @AllowSuspendedTenant()
    @Roles(UserRole.ADMIN)
    syncCheckout(@CurrentUser() user: RequestUser) {
        return this.billingService.syncCurrentTenantCheckout(user);
    }

    @Post('assign-plan')
    assignPlan(@Body() dto: AssignPlanDto, @CurrentUser() user: RequestUser) {
        return this.subscriptionsService.assignPlan(dto, user);
    }

    @Patch(':id/status')
    updateStatus(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateSubscriptionStatusDto,
        @CurrentUser() user: RequestUser,
    ) {
        return this.subscriptionsService.updateStatus(id, dto, user);
    }
}
