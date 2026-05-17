import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../../common/constants/enums';
import { AuditService } from '../../common/audit/audit.service';
import { AuditLogCategory, AuditLogSeverity } from '../../common/audit/audit.types';
import { RequestUser } from '../../common/interfaces/request.interface';
import { User } from '../users/entities/user.entity';
import { Tenant } from './entities/tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { SetupMyOrganizationDto } from './dto/setup-my-organization.dto';

export interface SetupOrganizationResult {
    tenant: Tenant;
    user: {
        id: number;
        email: string;
        firstName?: string | null;
        lastName?: string | null;
        role: UserRole;
        tenantId: number | null;
        tenant: Tenant;
    };
}

@Injectable()
export class TenantsService {
    /* istanbul ignore next */
    constructor(
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        private readonly auditService: AuditService,
    ) { }

    async create(dto: CreateTenantDto, currentUser?: RequestUser): Promise<Tenant> {
        const tenant = this.tenantRepo.create({
            name: dto.name,
            isActive: dto.isActive ?? true,
        });
        const saved = await this.tenantRepo.save(tenant);
        await this.auditService.logTenant({
            eventType: 'TENANT_CREATED',
            message: `Tenant ${saved.name} was created`,
            actor: await this.auditService.resolveActor(currentUser),
            tenantId: saved.id,
            tenantName: saved.name,
            targetType: 'tenant',
            targetId: saved.id,
            metadata: { isActive: saved.isActive },
        });
        return saved;
    }

    async findAll(): Promise<Tenant[]> {
        return this.tenantRepo.find();
    }

    async setupMyOrganization(currentUser: RequestUser, dto: SetupMyOrganizationDto): Promise<SetupOrganizationResult> {
        if (currentUser.role !== UserRole.ADMIN) {
            throw new ForbiddenException('Only tenant administrators can create an organization.');
        }
        if (currentUser.tenantId) {
            throw new ConflictException('You are already linked to an organization.');
        }

        const user = await this.userRepo.findOne({ where: { id: currentUser.id }, relations: ['tenant'] });
        if (!user) {
            throw new NotFoundException(`User #${currentUser.id} not found`);
        }
        if (user.role !== UserRole.ADMIN) {
            throw new ForbiddenException('Only tenant administrators can create an organization.');
        }
        if (user.tenantId) {
            throw new ConflictException('You are already linked to an organization.');
        }

        const organizationName = dto.organizationName.trim();
        const tenant = await this.tenantRepo.save(this.tenantRepo.create({
            name: organizationName,
            isActive: true,
        }));

        user.tenantId = tenant.id;
        user.tenant = tenant;
        const savedUser = await this.userRepo.save(user);
        await this.auditService.log({
            eventType: 'LEGACY_ADMIN_ORGANIZATION_SETUP',
            category: AuditLogCategory.TENANT,
            message: `Admin ${savedUser.email} set up organization ${tenant.name}`,
            actor: await this.auditService.resolveActor(currentUser),
            tenantId: tenant.id,
            tenantName: tenant.name,
            targetType: 'tenant',
            targetId: tenant.id,
        });

        return {
            tenant,
            user: {
                id: savedUser.id,
                email: savedUser.email,
                firstName: savedUser.firstName ?? null,
                lastName: savedUser.lastName ?? null,
                role: savedUser.role,
                tenantId: tenant.id,
                tenant,
            },
        };
    }

    async suspend(id: number, currentUser?: RequestUser): Promise<Tenant> {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) {
            throw new NotFoundException(`Tenant #${id} not found`);
        }
        tenant.isActive = false;
        const saved = await this.tenantRepo.save(tenant);
        await this.auditService.logTenant({
            eventType: 'TENANT_SUSPENDED',
            severity: AuditLogSeverity.WARNING,
            message: `Tenant ${saved.name} was suspended`,
            actor: await this.auditService.resolveActor(currentUser),
            tenantId: saved.id,
            tenantName: saved.name,
            targetType: 'tenant',
            targetId: saved.id,
        });
        return saved;
    }

    async reactivate(id: number, currentUser?: RequestUser): Promise<Tenant> {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) {
            throw new NotFoundException(`Tenant #${id} not found`);
        }
        tenant.isActive = true;
        const saved = await this.tenantRepo.save(tenant);
        await this.auditService.logTenant({
            eventType: 'TENANT_REACTIVATED',
            message: `Tenant ${saved.name} was reactivated`,
            actor: await this.auditService.resolveActor(currentUser),
            tenantId: saved.id,
            tenantName: saved.name,
            targetType: 'tenant',
            targetId: saved.id,
        });
        return saved;
    }
}
