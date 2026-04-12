import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../constants/enums';
import { SUPERVISOR_RESTRICTED_ROUTE_PREFIXES } from '../constants/supervisor-restricted-routes';
import { UsersService } from '../../modules/users/users.service';
import { HotelService } from '../../modules/hotel/hotel.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_HOTEL_CHECK_KEY } from '../decorators/skip-hotel-check.decorator';

import { AuthenticatedRequest } from '../interfaces/request.interface';

@Injectable()
export class HotelAccessGuard implements CanActivate {
    constructor(
        private readonly usersService: UsersService,
        private readonly hotelService: HotelService,
        private readonly reflector: Reflector,
    ) { }

    private isSupervisorRestrictedRoute(request: AuthenticatedRequest): boolean {
        const pathname = (request.originalUrl ?? request.url ?? '').split('?')[0];
        return SUPERVISOR_RESTRICTED_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Skip for @Public() routes
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const jwtUser = request.user;

        if (!jwtUser) {
            return false;
        }

        if (jwtUser.role === UserRole.SUPERVISOR && this.isSupervisorRestrictedRoute(request)) {
            throw new ForbiddenException('Supervisors cannot access tenant operational resources.');
        }

        // Skip for @SkipHotelCheck() routes after enforcing supervisor resource boundaries
        const skipHotelCheck = this.reflector.getAllAndOverride<boolean>(SKIP_HOTEL_CHECK_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (skipHotelCheck) {
            return true;
        }

        // Rule A: Supervisors bypass all hotel checks
        if (jwtUser.role === UserRole.SUPERVISOR) {
            return true;
        }

        // For non-supervisor users, x-hotel-id is MANDATORY
        const hotelIdHeader = request.headers['x-hotel-id'] as string | undefined;
        if (!hotelIdHeader) {
            throw new ForbiddenException('Missing x-hotel-id header. Admins and Commercials must specify a hotel context.');
        }

        const requiredHotelId = parseInt(hotelIdHeader, 10);
        if (isNaN(requiredHotelId)) {
            throw new ForbiddenException('Invalid x-hotel-id header format');
        }

        // Fetch fresh data from DB
        const dbUser = await this.usersService.findById(jwtUser.id);
        if (!dbUser) {
            throw new ForbiddenException('User no longer exists');
        }

        // Rule B: Admins bypass assigned relations but must match the tenant
        if (jwtUser.role === UserRole.ADMIN) {
            if (!dbUser.tenantId) {
                throw new ForbiddenException('Admin has no tenant assigned.');
            }

            const hotel = await this.hotelService.findById(requiredHotelId);
            if (!hotel || hotel.tenantId !== dbUser.tenantId) {
                throw new ForbiddenException(`Access denied to hotel #${requiredHotelId} outside your tenant bounds.`);
            }
            return true;
        }

        // Rule C: Commercials & Agents must be explicitly assigned to the hotel
        const hasAccess = dbUser.hotels?.some(h => h.id === requiredHotelId);
        if (!hasAccess) {
            throw new ForbiddenException(`Access denied to hotel #${requiredHotelId}`);
        }

        return true;
    }
}
