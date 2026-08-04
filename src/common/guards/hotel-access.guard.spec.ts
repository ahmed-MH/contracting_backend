import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../constants/enums';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_HOTEL_CHECK_KEY } from '../decorators/skip-hotel-check.decorator';
import { ALLOW_SUSPENDED_TENANT_KEY } from '../decorators/allow-suspended-tenant.decorator';
import { HotelAccessGuard } from './hotel-access.guard';

describe('HotelAccessGuard', () => {
    const usersService = {
        findById: jest.fn(),
    };

    const hotelService = {
        findById: jest.fn(),
    };

    const metadata = {
        isPublic: false,
        skipHotelCheck: false,
        allowSuspendedTenant: false,
    };

    const reflector = {
        getAllAndOverride: jest.fn((key: string) => {
            if (key === IS_PUBLIC_KEY) return metadata.isPublic;
            if (key === SKIP_HOTEL_CHECK_KEY) return metadata.skipHotelCheck;
            if (key === ALLOW_SUSPENDED_TENANT_KEY) return metadata.allowSuspendedTenant;
            return false;
        }),
    } as unknown as Reflector;

    let guard: HotelAccessGuard;

    const activeTenant = { id: 1, isActive: true };
    const suspendedTenant = { id: 1, isActive: false };

    function buildContext({
        user,
        headers = { 'x-hotel-id': '7' },
        originalUrl = '/hotel',
    }: {
        user?: any;
        headers?: Record<string, string>;
        originalUrl?: string;
    } = {}): ExecutionContext {
        return {
            getHandler: jest.fn(),
            getClass: jest.fn(),
            switchToHttp: jest.fn(() => ({
                getRequest: jest.fn(() => ({
                    user,
                    headers,
                    originalUrl,
                    url: originalUrl,
                })),
            })),
        } as unknown as ExecutionContext;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        metadata.isPublic = false;
        metadata.skipHotelCheck = false;
        metadata.allowSuspendedTenant = false;
        guard = new HotelAccessGuard(usersService as any, hotelService as any, reflector);
    });

    it('allows an active tenant ADMIN through a tenant hotel route', async () => {
        usersService.findById.mockResolvedValue({
            id: 1,
            role: UserRole.ADMIN,
            tenantId: 1,
            tenant: activeTenant,
            hotels: [],
        });
        hotelService.findById.mockResolvedValue({ id: 7, tenantId: 1 });

        await expect(guard.canActivate(buildContext({
            user: { id: 1, role: UserRole.ADMIN, tenantId: 1 },
        }))).resolves.toBe(true);
    });

    it('blocks a suspended tenant ADMIN from a protected tenant route', async () => {
        usersService.findById.mockResolvedValue({
            id: 1,
            role: UserRole.ADMIN,
            tenantId: 1,
            tenant: suspendedTenant,
            hotels: [],
        });

        await expect(guard.canActivate(buildContext({
            user: { id: 1, role: UserRole.ADMIN, tenantId: 1 },
        }))).rejects.toThrow(ForbiddenException);
        expect(hotelService.findById).not.toHaveBeenCalled();
    });

    it('blocks a suspended tenant COMMERCIAL from a protected tenant route', async () => {
        usersService.findById.mockResolvedValue({
            id: 2,
            role: UserRole.COMMERCIAL,
            tenantId: 1,
            tenant: suspendedTenant,
            hotels: [{ id: 7 }],
        });

        await expect(guard.canActivate(buildContext({
            user: { id: 2, role: UserRole.COMMERCIAL, tenantId: 1 },
        }))).rejects.toThrow(ForbiddenException);
    });

    it('blocks a suspended tenant AGENT from a protected tenant route', async () => {
        usersService.findById.mockResolvedValue({
            id: 3,
            role: UserRole.AGENT,
            tenantId: 1,
            tenant: suspendedTenant,
            hotels: [{ id: 7 }],
        });

        await expect(guard.canActivate(buildContext({
            user: { id: 3, role: UserRole.AGENT, tenantId: 1 },
        }))).rejects.toThrow(ForbiddenException);
    });

    it('does not require a user or tenant lookup for public routes', async () => {
        metadata.isPublic = true;

        await expect(guard.canActivate(buildContext())).resolves.toBe(true);
        expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('allows explicitly safe suspended-tenant routes', async () => {
        metadata.skipHotelCheck = true;
        metadata.allowSuspendedTenant = true;
        usersService.findById.mockResolvedValue({
            id: 1,
            role: UserRole.ADMIN,
            tenantId: 1,
            tenant: suspendedTenant,
            hotels: [],
        });

        await expect(guard.canActivate(buildContext({
            user: { id: 1, role: UserRole.ADMIN, tenantId: 1 },
            headers: {},
            originalUrl: '/users/me',
        }))).resolves.toBe(true);
    });
});
