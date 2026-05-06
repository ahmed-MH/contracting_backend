import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/interfaces/request.interface';
import { IntegrationEndpointStatus } from '../../common/constants/enums';
import { PREDEFINED_INTEGRATION_ENDPOINTS, RESERVATIONS_QUOTE_ENDPOINT_CODE } from './integration-endpoint-registry';
import { UpdateIntegrationEndpointDto } from './dto/integration-endpoint.dto';
import { IntegrationEndpoint } from './entities/integration-endpoint.entity';

@Injectable()
export class IntegrationEndpointsService {
    constructor(
        @InjectRepository(IntegrationEndpoint)
        private readonly endpointRepo: Repository<IntegrationEndpoint>,
        private readonly auditService: AuditService,
    ) { }

    async findAllForTenant(currentUser: RequestUser): Promise<IntegrationEndpoint[]> {
        await this.ensurePredefinedEndpoints(currentUser.tenantId ?? null, currentUser);
        return this.endpointRepo.find({
            where: { tenantId: currentUser.tenantId ?? IsNull() },
            order: { code: 'ASC' },
        });
    }

    async findByCodeForTenant(code: string, tenantId: number | null): Promise<IntegrationEndpoint | null> {
        await this.ensurePredefinedEndpoints(tenantId);
        return this.endpointRepo.findOne({
            where: { tenantId: tenantId ?? IsNull(), code },
        });
    }

    async update(id: number, dto: UpdateIntegrationEndpointDto, currentUser: RequestUser): Promise<IntegrationEndpoint> {
        const endpoint = await this.endpointRepo.findOne({
            where: { id, tenantId: currentUser.tenantId ?? IsNull() },
        });
        if (!endpoint) {
            throw new NotFoundException(`Integration endpoint #${id} not found`);
        }

        if (dto.status !== undefined) endpoint.status = dto.status;
        if (dto.requiresApiKey !== undefined) {
            endpoint.requiresApiKey = this.enforceApiKeyRequirement(endpoint.code, dto.requiresApiKey);
        }
        if (dto.rateLimitPerMinute !== undefined) endpoint.rateLimitPerMinute = dto.rateLimitPerMinute;

        const actor = await this.auditService.resolveActor(currentUser);
        this.auditService.applyUpdateAudit(endpoint, actor);
        return this.endpointRepo.save(endpoint);
    }

    async ensurePredefinedEndpoints(tenantId: number | null, currentUser?: RequestUser): Promise<void> {
        const actor = currentUser
            ? await this.auditService.resolveActor(currentUser)
            : this.auditService.systemActor();

        for (const definition of PREDEFINED_INTEGRATION_ENDPOINTS) {
            const existing = await this.endpointRepo.findOne({
                where: { tenantId: tenantId ?? IsNull(), code: definition.code },
            });

            if (existing) {
                const nextRequiresApiKey = this.enforceApiKeyRequirement(definition.code, existing.requiresApiKey);
                const nextRateLimit = existing.rateLimitPerMinute || definition.rateLimitPerMinute;
                const hasChanged =
                    existing.method !== definition.method
                    || existing.path !== definition.path
                    || existing.version !== definition.version
                    || JSON.stringify(existing.requestSchemaJson ?? null) !== JSON.stringify(definition.requestSchemaJson ?? null)
                    || JSON.stringify(existing.responseSchemaJson ?? null) !== JSON.stringify(definition.responseSchemaJson ?? null)
                    || existing.requiresApiKey !== nextRequiresApiKey
                    || existing.rateLimitPerMinute !== nextRateLimit;

                if (hasChanged) {
                    existing.method = definition.method;
                    existing.path = definition.path;
                    existing.version = definition.version;
                    existing.requestSchemaJson = definition.requestSchemaJson;
                    existing.responseSchemaJson = definition.responseSchemaJson;
                    existing.requiresApiKey = nextRequiresApiKey;
                    existing.rateLimitPerMinute = nextRateLimit;
                    this.auditService.applyUpdateAudit(existing, actor);
                    await this.endpointRepo.save(existing);
                }
                continue;
            }

            const endpoint = this.endpointRepo.create({
                tenantId,
                code: definition.code,
                method: definition.method,
                path: definition.path,
                version: definition.version,
                status: IntegrationEndpointStatus.ACTIVE,
                requiresApiKey: this.enforceApiKeyRequirement(definition.code, definition.requiresApiKey),
                rateLimitPerMinute: definition.rateLimitPerMinute,
                requestSchemaJson: definition.requestSchemaJson,
                responseSchemaJson: definition.responseSchemaJson,
            });
            this.auditService.applyCreateAudit(endpoint, actor);
            await this.endpointRepo.save(endpoint);
        }
    }

    private enforceApiKeyRequirement(code: string, requiresApiKey: boolean): boolean {
        if (code === RESERVATIONS_QUOTE_ENDPOINT_CODE) {
            return true;
        }

        return requiresApiKey;
    }
}
