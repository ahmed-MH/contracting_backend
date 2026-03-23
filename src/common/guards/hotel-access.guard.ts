import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from '../constants/enums';
import { UsersService } from '../../modules/users/users.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_HOTEL_CHECK_KEY } from '../decorators/skip-hotel-check.decorator';

interface RequestUser {
    id: number;
    email: string;
    role: UserRole;
    hotelIds: number[];
}

@Injectable()
export class HotelAccessGuard implements CanActivate {
    constructor(
        private readonly usersService: UsersService,
        private readonly reflector: Reflector,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Skip for @Public() routes
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }

        // Skip for @SkipHotelCheck() routes (e.g. /users/me, /users/me/hotels)
        const skipHotelCheck = this.reflector.getAllAndOverride<boolean>(SKIP_HOTEL_CHECK_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (skipHotelCheck) {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request>();
        const jwtUser = request.user as RequestUser | undefined;

        // Should not happen if JwtAuthGuard is applied first, but safety net
        if (!jwtUser) {
            return false;
        }

        // Admins bypass all hotel checks
        if (jwtUser.role === UserRole.ADMIN) {
            return true;
        }

        // For non-admin users, x-hotel-id is MANDATORY
        const hotelIdHeader = request.headers['x-hotel-id'] as string | undefined;
        if (!hotelIdHeader) {
            throw new ForbiddenException('Missing x-hotel-id header. Non-admin users must specify a hotel context.');
        }

        const requiredHotelId = parseInt(hotelIdHeader, 10);
        if (isNaN(requiredHotelId)) {
            throw new ForbiddenException('Invalid x-hotel-id header format');
        }

        // Fetch fresh data from DB to avoid stale JWT payload
        const dbUser = await this.usersService.findById(jwtUser.id);
        if (!dbUser) {
            throw new ForbiddenException('User no longer exists');
        }

        // Check if the user is assigned to the requested hotel
        const hasAccess = dbUser.hotels?.some(h => h.id === requiredHotelId);
        if (!hasAccess) {
            throw new ForbiddenException(`Access denied to hotel #${requiredHotelId}`);
        }

        return true;
    }
}
