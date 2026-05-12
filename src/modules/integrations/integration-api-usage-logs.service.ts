import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { IntegrationApiKeyEnvironment, IntegrationUsageLogSource } from '../../common/constants/enums';
import { PageDto } from '../../common/dto/page.dto';
import { RequestUser } from '../../common/interfaces/request.interface';
import { IntegrationUsageLogQueryDto } from './dto/integration-usage-log.dto';
import { IntegrationApiUsageLog } from './entities/integration-api-usage-log.entity';

export interface CreateIntegrationUsageLogInput {
    tenantId: number | null;
    endpointCode: string;
    source: IntegrationUsageLogSource;
    apiUserId: number | null;
    apiKeyId: number | null;
    apiKeyEnvironment: IntegrationApiKeyEnvironment | null;
    hotelId: number | null;
    requestId: string | null;
    externalReservationCode: string | null;
    statusCode: number;
    success: boolean;
    errorCode: string | null;
    errorMessage: string | null;
    durationMs: number;
    ipAddress: string | null;
    requestJson?: Record<string, unknown> | null;
    responseJson?: Record<string, unknown> | null;
}

@Injectable()
export class IntegrationApiUsageLogsService {
    constructor(
        @InjectRepository(IntegrationApiUsageLog)
        private readonly usageLogRepo: Repository<IntegrationApiUsageLog>,
    ) { }

    async create(input: CreateIntegrationUsageLogInput): Promise<void> {
        await this.usageLogRepo.save(this.usageLogRepo.create(input));
    }

    async countRecentRequests(apiKeyId: number, endpointCode: string, since: Date): Promise<number> {
        return this.usageLogRepo.count({
            where: {
                apiKeyId,
                endpointCode,
                createdAt: MoreThanOrEqual(since),
            },
        });
    }

    async findAll(currentUser: RequestUser, query: IntegrationUsageLogQueryDto): Promise<PageDto<IntegrationApiUsageLog>> {
        const builder = this.usageLogRepo
            .createQueryBuilder('log')
            .leftJoinAndSelect('log.apiUser', 'apiUser')
            .leftJoinAndSelect('log.apiKey', 'apiKey')
            .leftJoinAndSelect('apiKey.rotatedFrom', 'rotatedFrom')
            .leftJoinAndSelect('apiKey.rotatedTo', 'rotatedTo')
            .leftJoinAndSelect('log.hotel', 'hotel')
            .orderBy('log.createdAt', 'DESC');

        if (currentUser.tenantId == null) {
            builder.where('log.tenantId IS NULL');
        } else {
            builder.where('log.tenantId = :tenantId', { tenantId: currentUser.tenantId });
        }

        if (query.endpointCode) {
            builder.andWhere('log.endpointCode = :endpointCode', { endpointCode: query.endpointCode });
        }
        if (query.apiUserId) {
            builder.andWhere('log.apiUserId = :apiUserId', { apiUserId: query.apiUserId });
        }
        if (query.hotelId) {
            builder.andWhere('log.hotelId = :hotelId', { hotelId: query.hotelId });
        }
        if (query.success !== undefined) {
            builder.andWhere('log.success = :success', { success: query.success === 'true' });
        }
        if (query.dateFrom) {
            builder.andWhere('log.createdAt >= :dateFrom', { dateFrom: `${query.dateFrom}T00:00:00.000Z` });
        }
        if (query.dateTo) {
            builder.andWhere('log.createdAt <= :dateTo', { dateTo: `${query.dateTo}T23:59:59.999Z` });
        }

        const [data, total] = await builder
            .skip(query.skip)
            .take(query.limit)
            .getManyAndCount();

        return new PageDto(data, total, query.page, query.limit);
    }
}
