import { AuthenticatedRequest } from '../../common/interfaces/request.interface';
import { Controller, Get, Patch, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { UpdateUserDto } from './dto/update-user.dto';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request.interface';

@Controller('users')
@Roles(UserRole.ADMIN)
@SkipHotelCheck()
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    // ─── Current User Endpoints (ALL business roles) ──────────────

    @Get('me')
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.AGENT)
    getMe(@Req() req: AuthenticatedRequest) {
        const user = req.user as RequestUser;
        return this.usersService.findById(user.id);
    }

    @Get('me/hotels')
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

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.usersService.remove(id);
    }
}
