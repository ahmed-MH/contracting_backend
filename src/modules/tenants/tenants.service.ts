import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './entities/tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Injectable()
export class TenantsService {
    /* istanbul ignore next */
    constructor(
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
    ) { }

    async create(dto: CreateTenantDto): Promise<Tenant> {
        const tenant = this.tenantRepo.create({
            name: dto.name,
            isActive: dto.isActive ?? true,
        });
        return this.tenantRepo.save(tenant);
    }

    async findAll(): Promise<Tenant[]> {
        return this.tenantRepo.find();
    }

    async suspend(id: number): Promise<Tenant> {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) {
            throw new NotFoundException(`Tenant #${id} not found`);
        }
        tenant.isActive = false;
        return this.tenantRepo.save(tenant);
    }
}
