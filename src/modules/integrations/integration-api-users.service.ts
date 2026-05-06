import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/interfaces/request.interface';
import { Hotel } from '../hotel/entities/hotel.entity';
import { IntegrationApiUserStatus } from '../../common/constants/enums';
import {
    CreateIntegrationApiUserDto,
    UpdateIntegrationApiUserDto,
} from './dto/integration-api-user.dto';
import { IntegrationApiUser } from './entities/integration-api-user.entity';

@Injectable()
export class IntegrationApiUsersService {
    constructor(
        @InjectRepository(IntegrationApiUser)
        private readonly apiUserRepo: Repository<IntegrationApiUser>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
        private readonly auditService: AuditService,
    ) { }

    async findAll(currentUser: RequestUser): Promise<IntegrationApiUser[]> {
        return this.apiUserRepo.find({
            where: { tenantId: currentUser.tenantId ?? IsNull() },
            relations: ['allowedHotels'],
            order: { name: 'ASC', id: 'ASC' },
        });
    }

    async findByIdForTenant(id: number, tenantId: number | null): Promise<IntegrationApiUser | null> {
        return this.apiUserRepo.findOne({
            where: { id, tenantId: tenantId ?? IsNull() },
            relations: ['allowedHotels'],
        });
    }

    async create(dto: CreateIntegrationApiUserDto, currentUser: RequestUser): Promise<IntegrationApiUser> {
        const allowedHotels = await this.resolveAllowedHotels(dto.allowedHotelIds, currentUser.tenantId);
        const actor = await this.auditService.resolveActor(currentUser);
        const apiUser = this.apiUserRepo.create({
            name: dto.name,
            description: dto.description ?? null,
            status: dto.status ?? IntegrationApiUserStatus.ACTIVE,
            permissions: dto.permissions,
            tenantId: currentUser.tenantId ?? null,
            allowedHotels,
        });
        this.auditService.applyCreateAudit(apiUser, actor);
        return this.apiUserRepo.save(apiUser);
    }

    async update(id: number, dto: UpdateIntegrationApiUserDto, currentUser: RequestUser): Promise<IntegrationApiUser> {
        const apiUser = await this.findByIdForTenant(id, currentUser.tenantId);
        if (!apiUser) {
            throw new NotFoundException(`Integration API user #${id} not found`);
        }

        if (dto.allowedHotelIds) {
            apiUser.allowedHotels = await this.resolveAllowedHotels(dto.allowedHotelIds, currentUser.tenantId);
        }
        if (dto.name !== undefined) apiUser.name = dto.name;
        if (dto.description !== undefined) apiUser.description = dto.description ?? null;
        if (dto.status !== undefined) apiUser.status = dto.status;
        if (dto.permissions !== undefined) apiUser.permissions = dto.permissions;

        const actor = await this.auditService.resolveActor(currentUser);
        this.auditService.applyUpdateAudit(apiUser, actor);
        return this.apiUserRepo.save(apiUser);
    }

    private async resolveAllowedHotels(hotelIds: number[], tenantId: number | null): Promise<Hotel[]> {
        if (hotelIds.length === 0) {
            throw new BadRequestException('At least one allowed hotel is required.');
        }

        const hotels = await this.hotelRepo.find({
            where: {
                id: In(hotelIds),
                tenantId: tenantId ?? IsNull(),
            },
        });

        if (hotels.length !== hotelIds.length) {
            throw new BadRequestException('One or more selected hotels are invalid for the current organization.');
        }

        return hotels;
    }
}
