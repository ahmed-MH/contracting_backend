import { Controller, Post, Body, Get, Query, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { AllowSuspendedTenant } from '../../common/decorators/allow-suspended-tenant.decorator';
import { UserRole } from '../../common/constants/enums';
import { UsersService } from '../users/users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request.interface';

@Controller('auth')
@SkipHotelCheck()
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly usersService: UsersService,
    ) { }

    // ─── Public routes (no JWT required) ─────────────────────────

    @Public()
    @Post('login')
    login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }

    @Public()
    @Post('accept-invite')
    acceptInvite(@Body() dto: AcceptInviteDto) {
        return this.authService.acceptInvite(dto);
    }

    @Public()
    @Get('invite-status')
    validateInvite(@Query('token') token?: string) {
        return this.authService.validateInviteToken(token);
    }

    @Public()
    @Post('forgot-password')
    forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.authService.forgotPassword(dto);
    }

    @Public()
    @Post('reset-password')
    resetPassword(@Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(dto);
    }

    // ─── Protected routes ────────────────────────────────────────

    @Get('me')
    @AllowSuspendedTenant()
    @Roles(UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.COMMERCIAL)
    getProfile(@Request() req: { user: { id: number; email: string; role: string } }) {
        return req.user;
    }

    @Post('invite')
    @Roles(UserRole.ADMIN)
    invite(@Body() dto: InviteUserDto, @CurrentUser() user: RequestUser) {
        return this.authService.invite(dto, user);
    }

    @Get('users')
    @Roles(UserRole.ADMIN)
    listUsers(@CurrentUser() user: RequestUser) {
        return this.usersService.findAll(user);
    }
}
