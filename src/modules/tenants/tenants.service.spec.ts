import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { UserRole } from '../../common/constants/enums';
import { User } from '../users/entities/user.entity';
import { Tenant } from './entities/tenant.entity';
import { TenantsService } from './tenants.service';

describe('TenantsService', () => {
    let service: TenantsService;
    const tenantRepo = {
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
    };
    const userRepo = {
        findOne: jest.fn(),
        save: jest.fn(),
    };
    const auditService = {
        log: jest.fn(),
        logTenant: jest.fn(),
        resolveActor: jest.fn().mockResolvedValue({ userId: null, email: null, role: 'SYSTEM', name: 'System' }),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TenantsService,
                { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
                { provide: getRepositoryToken(User), useValue: userRepo },
                { provide: AuditService, useValue: auditService },
            ],
        }).compile();

        service = module.get(TenantsService);
        jest.clearAllMocks();
        tenantRepo.create.mockImplementation((value) => value);
    });

    it('lets a legacy admin without a tenant create and link an organization', async () => {
        const tenant = { id: 20, name: 'Marriott Tunisia', isActive: true } as Tenant;
        const user = {
            id: 10,
            email: 'admin@example.com',
            firstName: 'Legacy',
            lastName: 'Admin',
            role: UserRole.ADMIN,
            tenantId: null,
            tenant: null,
        } as unknown as User;

        userRepo.findOne.mockResolvedValue(user);
        tenantRepo.save.mockImplementation(async (value) => ({ ...value, id: value.id ?? 20 }));
        userRepo.save.mockImplementation(async (value) => value);

        const result = await service.setupMyOrganization({
            id: 10,
            email: 'admin@example.com',
            role: UserRole.ADMIN,
            hotelIds: [],
            tenantId: null,
        }, { organizationName: '  Marriott Tunisia  ' });

        expect(tenantRepo.create).toHaveBeenCalledWith({
            name: 'Marriott Tunisia',
            isActive: true,
        });
        expect(userRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            id: 10,
            tenantId: 20,
            tenant: expect.objectContaining({ id: 20 }),
        }));
        expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'LEGACY_ADMIN_ORGANIZATION_SETUP',
            tenantId: 20,
        }));
        expect(result).toEqual({
            tenant,
            user: expect.objectContaining({
                id: 10,
                role: UserRole.ADMIN,
                tenantId: 20,
                tenant,
            }),
        });
    });

    it('rejects organization setup when the admin is already linked to a tenant', async () => {
        await expect(service.setupMyOrganization({
            id: 10,
            email: 'admin@example.com',
            role: UserRole.ADMIN,
            hotelIds: [],
            tenantId: 20,
        }, { organizationName: 'Another Tenant' })).rejects.toThrow(ConflictException);

        expect(tenantRepo.save).not.toHaveBeenCalled();
        expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('rejects commercial and agent organization setup', async () => {
        await expect(service.setupMyOrganization({
            id: 11,
            email: 'commercial@example.com',
            role: UserRole.COMMERCIAL,
            hotelIds: [],
            tenantId: null,
        }, { organizationName: 'Commercial Tenant' })).rejects.toThrow(ForbiddenException);

        await expect(service.setupMyOrganization({
            id: 12,
            email: 'agent@example.com',
            role: UserRole.AGENT,
            hotelIds: [],
            tenantId: null,
        }, { organizationName: 'Agent Tenant' })).rejects.toThrow(ForbiddenException);

        expect(tenantRepo.save).not.toHaveBeenCalled();
        expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('shows the created organization through the tenant list', async () => {
        const tenant = { id: 20, name: 'Marriott Tunisia', isActive: true } as Tenant;
        tenantRepo.find.mockResolvedValue([tenant]);

        await expect(service.findAll()).resolves.toEqual([tenant]);
        expect(tenantRepo.find).toHaveBeenCalled();
    });

    it('logs tenant creation', async () => {
        tenantRepo.save.mockImplementation(async (tenant) => ({ ...tenant, id: 21 }));

        const result = await service.create({ name: 'Pricify Demo', isActive: true });

        expect(result.id).toBe(21);
        expect(auditService.logTenant).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'TENANT_CREATED',
            tenantId: 21,
        }));
    });

    it('reactivates a suspended tenant', async () => {
        tenantRepo.findOne.mockResolvedValue({ id: 7, name: 'Demo Tenant', isActive: false });
        tenantRepo.save.mockImplementation(async (tenant) => tenant);

        const result = await service.reactivate(7);

        expect(tenantRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            id: 7,
            isActive: true,
        }));
        expect(auditService.logTenant).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'TENANT_REACTIVATED',
            tenantId: 7,
        }));
        expect(result.isActive).toBe(true);
    });

    it('logs when a tenant is suspended', async () => {
        tenantRepo.findOne.mockResolvedValue({ id: 7, name: 'Demo Tenant', isActive: true });
        tenantRepo.save.mockImplementation(async (tenant) => tenant);

        const result = await service.suspend(7);

        expect(result.isActive).toBe(false);
        expect(auditService.logTenant).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'TENANT_SUSPENDED',
            tenantId: 7,
        }));
    });

    it('throws when reactivating a missing tenant', async () => {
        tenantRepo.findOne.mockResolvedValue(null);

        await expect(service.reactivate(999)).rejects.toThrow(NotFoundException);
    });
});
