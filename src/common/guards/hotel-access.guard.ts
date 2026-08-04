import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../constants/enums';
import { UsersService } from '../../modules/users/users.service';
import { HotelService } from '../../modules/hotel/hotel.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_HOTEL_CHECK_KEY } from '../decorators/skip-hotel-check.decorator';
import { ALLOW_SUSPENDED_TENANT_KEY } from '../decorators/allow-suspended-tenant.decorator';

import { AuthenticatedRequest } from '../interfaces/request.interface';
import type { User } from '../../modules/users/entities/user.entity';

@Injectable()
export class HotelAccessGuard implements CanActivate {
    constructor(
        private readonly usersService: UsersService,
        private readonly hotelService: HotelService,
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

        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const jwtUser = request.user;

        if (!jwtUser) {
            return false;
        }

        const allowSuspendedTenant = this.reflector.getAllAndOverride<boolean>(ALLOW_SUSPENDED_TENANT_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        // Fetch fresh data before honoring @SkipHotelCheck(), so suspended tenants cannot keep
        // using existing JWTs against tenant management or operational routes.
        const dbUser = await this.usersService.findById(jwtUser.id);
        if (!dbUser) {
            throw new ForbiddenException('User no longer exists');
        }

        this.enforceActiveTenant(dbUser, allowSuspendedTenant);

        // Skip for @SkipHotelCheck() routes after enforcing tenant status
        const skipHotelCheck = this.reflector.getAllAndOverride<boolean>(SKIP_HOTEL_CHECK_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (skipHotelCheck) {
            return true;
        }

        // For hotel-scoped routes, x-hotel-id is MANDATORY
        const hotelIdHeader = request.headers['x-hotel-id'] as string | undefined;
        if (!hotelIdHeader) {
            throw new ForbiddenException('Missing x-hotel-id header. Admins and Commercials must specify a hotel context.');
        }

        const requiredHotelId = parseInt(hotelIdHeader, 10);
        if (isNaN(requiredHotelId)) {
            throw new ForbiddenException('Invalid x-hotel-id header format');
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

    private enforceActiveTenant(dbUser: User, allowSuspendedTenant?: boolean): void {
        if (!dbUser.tenantId || allowSuspendedTenant) {
            return;
        }

        if (!dbUser.tenant || dbUser.tenant.isActive === false) {
            throw new ForbiddenException('Your organization is suspended. Contact your administrator or support.');
        }
    }
}
