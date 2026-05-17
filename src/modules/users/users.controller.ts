import { AuthenticatedRequest } from '../../common/interfaces/request.interface';
import { Controller, Get, Patch, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateCurrentUserDto } from './dto/update-current-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { AllowSuspendedTenant } from '../../common/decorators/allow-suspended-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request.interface';

@Controller('users')
@Roles(UserRole.ADMIN)
@SkipHotelCheck()
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    // ─── Current User Endpoints (ALL business roles) ──────────────

    @Get('me')
    @AllowSuspendedTenant()
    @Roles(UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.AGENT)
    getMe(@Req() req: AuthenticatedRequest) {
        const user = req.user as RequestUser;
        return this.usersService.findCurrentProfile(user.id);
    }

    @Patch('me')
    @AllowSuspendedTenant()
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.AGENT)
    updateMe(@CurrentUser() user: RequestUser, @Body() dto: UpdateCurrentUserDto) {
        return this.usersService.updateCurrentProfile(user.id, dto);
    }

    @Patch('me/password')
    @AllowSuspendedTenant()
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.AGENT)
    changePassword(@CurrentUser() user: RequestUser, @Body() dto: ChangePasswordDto) {
        return this.usersService.changeCurrentPassword(user.id, dto);
    }

    @Get('me/hotels')
    @AllowSuspendedTenant()
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.AGENT)
    async getMyHotels(@Req() req: AuthenticatedRequest) {
        const user = req.user as RequestUser;
        return await this.usersService.findAssignedHotels(user.id);
    }

    // ─── Admin-Only User Management ──────────────────────────────

    @Get()
    findAll(@CurrentUser() user: RequestUser) {
        return this.usersService.findAll(user);
    }

    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() updateUserDto: UpdateUserDto) {
        return this.usersService.update(id, updateUserDto);
    }

    @Patch(':id/suspend')
    suspend(@Param('id', ParseIntPipe) id: number) {
        return this.usersService.suspend(id);
    }

    @Patch(':id/reactivate')
    reactivate(@Param('id', ParseIntPipe) id: number) {
        return this.usersService.reactivate(id);
    }

    @Delete('invites/:userId')
    removePendingInvite(
        @Param('userId', ParseIntPipe) userId: number,
        @CurrentUser() user: RequestUser,
    ) {
        return this.usersService.cancelPendingInvite(userId, user);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.usersService.remove(id);
    }
}
