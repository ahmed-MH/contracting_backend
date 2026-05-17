import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '../constants/enums';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { SKIP_HOTEL_CHECK_KEY } from '../decorators/skip-hotel-check.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { AuditService } from './audit.service';
import { SystemLogsController } from './system-logs.controller';

describe('SystemLogsController', () => {
    let controller: SystemLogsController;
    const auditService = {
        list: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [SystemLogsController],
            providers: [{ provide: AuditService, useValue: auditService }],
        }).compile();

        controller = module.get(SystemLogsController);
        jest.clearAllMocks();
    });

    it('lists logs through the audit service for supervisor routes', async () => {
        auditService.list.mockResolvedValue({ items: [], page: 1, limit: 25, total: 0 });

        await expect(controller.list({ page: 1, limit: 25 })).resolves.toEqual({
            items: [],
            page: 1,
            limit: 25,
            total: 0,
        });
    });

    it('is decorated for supervisor-only access', () => {
        const reflector = new Reflector();
        const roles = reflector.get<UserRole[]>(ROLES_KEY, SystemLogsController);

        expect(roles).toEqual([UserRole.SUPERVISOR]);
        expect(roles).not.toContain(UserRole.ADMIN);
        expect(reflector.get<boolean>(SKIP_HOTEL_CHECK_KEY, SystemLogsController)).toBe(true);
        expect(reflector.get<boolean>(IS_PUBLIC_KEY, SystemLogsController)).toBeUndefined();
    });

    it.each([
        [UserRole.SUPERVISOR, true],
        [UserRole.ADMIN, false],
        [UserRole.COMMERCIAL, false],
        [UserRole.AGENT, false],
    ])('evaluates %s access through RolesGuard as %s', (role, expected) => {
        const guard = new RolesGuard(new Reflector());
        const context = {
            getHandler: jest.fn(() => controller.list),
            getClass: jest.fn(() => SystemLogsController),
            switchToHttp: jest.fn(() => ({
                getRequest: jest.fn(() => ({ user: { id: 1, role } })),
            })),
        } as unknown as ExecutionContext;

        expect(guard.canActivate(context)).toBe(expected);
    });
});
