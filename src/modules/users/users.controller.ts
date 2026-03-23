import { Controller, Get, Patch, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { UpdateUserDto } from './dto/update-user.dto';
import { SkipHotelCheck } from '../../common/decorators/skip-hotel-check.decorator';
import { Request } from 'express';

interface RequestUser {
    id: number;
    email: string;
    role: string;
}

@Controller('users')
@Roles(UserRole.ADMIN)
@SkipHotelCheck()
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    // ─── Current User Endpoints (ALL business roles) ──────────────

    @Get('me')
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    getMe(@Req() req: Request) {
        const user = req.user as RequestUser;
        return this.usersService.findById(user.id);
    }

    @Get('me/hotels')
    @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
    async getMyHotels(@Req() req: Request) {
        const user = req.user as RequestUser;
        return await this.usersService.findAssignedHotels(user.id);
    }

    // ─── Admin-Only User Management ──────────────────────────────

    @Get()
    findAll() {
        return this.usersService.findAll();
    }

    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() updateUserDto: UpdateUserDto) {
        return this.usersService.update(id, updateUserDto);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.usersService.remove(id);
    }
}
