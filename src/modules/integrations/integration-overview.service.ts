import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThanOrEqual, Repository } from 'typeorm';
import {
    IntegrationAlertSeverity,
    IntegrationApiKeyStatus,
    IntegrationApiUserStatus,
    IntegrationEndpointStatus,
} from '../../common/constants/enums';
import { RequestUser } from '../../common/interfaces/request.interface';
import { IntegrationApiKey } from './entities/integration-api-key.entity';
import { IntegrationApiUsageLog } from './entities/integration-api-usage-log.entity';
import { IntegrationApiUser } from './entities/integration-api-user.entity';
import { IntegrationEndpoint } from './entities/integration-endpoint.entity';
import { RESERVATIONS_QUOTE_ENDPOINT_CODE } from './integration-endpoint-registry';
import { IntegrationEndpointsService } from './integration-endpoints.service';

interface IntegrationOverviewAlert {
    code: string;
    severity: IntegrationAlertSeverity;
    message: string;
}

@Injectable()
export class IntegrationOverviewService {
    constructor(
        @InjectRepository(IntegrationApiUsageLog)
        private readonly usageLogRepo: Repository<IntegrationApiUsageLog>,
        @InjectRepository(IntegrationApiUser)
        private readonly apiUserRepo: Repository<IntegrationApiUser>,
        @InjectRepository(IntegrationApiKey)
        private readonly apiKeyRepo: Repository<IntegrationApiKey>,
        @InjectRepository(IntegrationEndpoint)
        private readonly endpointRepo: Repository<IntegrationEndpoint>,
        private readonly endpointsService: IntegrationEndpointsService,
    ) { }

    async getOverview(currentUser: RequestUser) {
        const tenantId = currentUser.tenantId ?? null;
        await this.endpointsService.ensurePredefinedEndpoints(tenantId, currentUser);

        const todayStart = this.utcDayStart(new Date());
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const tenantWhere = tenantId == null ? 'log.tenantId IS NULL' : 'log.tenantId = :tenantId';
        const tenantParams = tenantId == null ? {} : { tenantId };

        const [todayLogs, recentUsageLogs, endpoints, activeApiUsers, activeApiKeyRows, lastSuccessfulQuote, lastFailedQuote] =
            await Promise.all([
                this.usageLogRepo.find({
                    where: {
                        tenantId: tenantId ?? IsNull(),
                        createdAt: MoreThanOrEqual(todayStart),
                    },
                    relations: ['apiUser', 'apiKey', 'hotel'],
                    order: { createdAt: 'DESC' },
                }),
                this.usageLogRepo.find({
                    where: { tenantId: tenantId ?? IsNull() },
                    relations: ['apiUser', 'apiKey', 'hotel'],
                    order: { createdAt: 'DESC' },
                    take: 10,
                }),
                this.endpointRepo.find({
                    where: { tenantId: tenantId ?? IsNull() },
                    order: { code: 'ASC' },
                }),
                this.apiUserRepo.count({
                    where: {
                        tenantId: tenantId ?? IsNull(),
                        status: IntegrationApiUserStatus.ACTIVE,
                    },
                }),
                this.apiKeyRepo.find({
                    where: {
                        status: IntegrationApiKeyStatus.ACTIVE,
                        apiUser: { tenantId: tenantId ?? IsNull() },
                    },
                    relations: ['apiUser'],
                }),
                this.usageLogRepo.findOne({
                    where: {
                        tenantId: tenantId ?? IsNull(),
                        endpointCode: RESERVATIONS_QUOTE_ENDPOINT_CODE,
                        success: true,
                    },
                    relations: ['apiUser', 'apiKey', 'hotel'],
                    order: { createdAt: 'DESC' },
                }),
                this.usageLogRepo.findOne({
                    where: {
                        tenantId: tenantId ?? IsNull(),
                        endpointCode: RESERVATIONS_QUOTE_ENDPOINT_CODE,
                        success: false,
                    },
                    relations: ['apiUser', 'apiKey', 'hotel'],
                    order: { createdAt: 'DESC' },
                }),
            ]);

        const endpointLastCalls = new Map(
            await Promise.all(endpoints.map(async (endpoint) => {
                const [lastSuccessfulCall, lastFailedCall] = await Promise.all([
                    this.usageLogRepo.findOne({
                        where: {
                            tenantId: tenantId ?? IsNull(),
                            endpointCode: endpoint.code,
                            success: true,
                        },
                        order: { createdAt: 'DESC' },
                    }),
                    this.usageLogRepo.findOne({
                        where: {
                            tenantId: tenantId ?? IsNull(),
                            endpointCode: endpoint.code,
                            success: false,
                        },
                        order: { createdAt: 'DESC' },
                    }),
                ]);

                return [endpoint.code, {
                    lastSuccessfulCall: lastSuccessfulCall?.createdAt ?? null,
                    lastFailedCall: lastFailedCall?.createdAt ?? null,
                }] as const;
            })),
        );

        const totalsToday = todayLogs.length;
        const now = new Date();
        const activeApiKeys = activeApiKeyRows.filter((key) => !key.expiresAt || key.expiresAt > now).length;
        const successfulToday = todayLogs.filter((log) => log.success).length;
        const failedToday = todayLogs.filter((log) => !log.success).length;
        const rateLimitedToday = todayLogs.filter((log) => log.errorCode === 'RATE_LIMIT_EXCEEDED').length;
        const averageDurationToday = totalsToday
            ? Math.round(todayLogs.reduce((sum, log) => sum + log.durationMs, 0) / totalsToday)
            : 0;
        const successRateToday = totalsToday ? Math.round((successfulToday / totalsToday) * 1000) / 10 : 100;

        const topErrorCodes = Array.from(
            todayLogs
                .filter((log) => !!log.errorCode)
                .reduce((map, log) => map.set(log.errorCode!, (map.get(log.errorCode!) ?? 0) + 1), new Map<string, number>()),
        )
            .map(([errorCode, count]) => ({ errorCode, count }))
            .sort((left, right) => right.count - left.count)
            .slice(0, 5);

        const endpointHealth = endpoints.map((endpoint) => {
            const endpointLogs = todayLogs.filter((log) => log.endpointCode === endpoint.code);
            const endpointSuccesses = endpointLogs.filter((log) => log.success);
            const lastCalls = endpointLastCalls.get(endpoint.code);
            return {
                endpointCode: endpoint.code,
                status: endpoint.status,
                lastSuccessfulCall: lastCalls?.lastSuccessfulCall ?? null,
                lastFailedCall: lastCalls?.lastFailedCall ?? null,
                successRateToday: endpointLogs.length
                    ? Math.round((endpointSuccesses.length / endpointLogs.length) * 1000) / 10
                    : 100,
                averageDurationToday: endpointLogs.length
                    ? Math.round(endpointLogs.reduce((sum, log) => sum + log.durationMs, 0) / endpointLogs.length)
                    : 0,
                rateLimitHitsToday: endpointLogs.filter((log) => log.errorCode === 'RATE_LIMIT_EXCEEDED').length,
                currentRateLimitPerMinute: endpoint.rateLimitPerMinute,
            };
        });

        const recentSuccessCount = await this.usageLogRepo
            .createQueryBuilder('log')
            .where(tenantWhere, tenantParams)
            .andWhere('log.endpointCode = :endpointCode', { endpointCode: RESERVATIONS_QUOTE_ENDPOINT_CODE })
            .andWhere('log.success = :success', { success: true })
            .andWhere('log.createdAt >= :last24h', { last24h })
            .getCount();

        return {
            totalsToday,
            successRateToday,
            averageDurationToday,
            failedToday,
            rateLimitedToday,
            activeApiUsers,
            activeApiKeys,
            endpointHealth,
            topErrorCodes,
            recentUsageLogs,
            lastSuccessfulQuote,
            lastFailedQuote,
            alerts: await this.buildAlerts({
                tenantId,
                endpoints,
                todayLogs,
                recentSuccessCount,
            }),
        };
    }

    private async buildAlerts(args: {
        tenantId: number | null;
        endpoints: IntegrationEndpoint[];
        todayLogs: IntegrationApiUsageLog[];
        recentSuccessCount: number;
    }): Promise<IntegrationOverviewAlert[]> {
        const alerts: IntegrationOverviewAlert[] = [];
        const now = new Date();
        const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const expiringKeys = await this.apiKeyRepo.find({
            where: {
                status: In([IntegrationApiKeyStatus.ACTIVE, IntegrationApiKeyStatus.EXPIRED]),
                apiUser: { tenantId: args.tenantId ?? IsNull() },
            },
            relations: ['apiUser'],
        });

        const expiringSoonCount = expiringKeys.filter((key) =>
            key.expiresAt && key.expiresAt > now && key.expiresAt <= sevenDaysFromNow,
        ).length;
        const expiredCount = expiringKeys.filter((key) =>
            key.status === IntegrationApiKeyStatus.EXPIRED || (key.expiresAt && key.expiresAt <= now),
        ).length;

        if (expiringSoonCount > 0) {
            alerts.push({
                code: 'API_KEY_EXPIRES_SOON',
                severity: IntegrationAlertSeverity.WARNING,
                message: `${expiringSoonCount} API key(s) expire within 7 days.`,
            });
        }
        if (expiredCount > 0) {
            alerts.push({
                code: 'API_KEY_EXPIRED',
                severity: IntegrationAlertSeverity.CRITICAL,
                message: `${expiredCount} API key(s) have expired and should be rotated or revoked.`,
            });
        }

        for (const endpoint of args.endpoints) {
            if (endpoint.status === IntegrationEndpointStatus.INACTIVE) {
                alerts.push({
                    code: 'ENDPOINT_DISABLED',
                    severity: IntegrationAlertSeverity.CRITICAL,
                    message: `${endpoint.code} is inactive.`,
                });
            }
        }

        const failureCount = args.todayLogs.filter((log) => !log.success).length;
        const failureRate = args.todayLogs.length ? failureCount / args.todayLogs.length : 0;
        if (args.todayLogs.length >= 5 && failureRate >= 0.3) {
            alerts.push({
                code: 'HIGH_FAILURE_RATE',
                severity: IntegrationAlertSeverity.WARNING,
                message: `Failure rate is ${Math.round(failureRate * 100)}% today.`,
            });
        }

        const rateLimitHits = args.todayLogs.filter((log) => log.errorCode === 'RATE_LIMIT_EXCEEDED').length;
        if (rateLimitHits >= 5) {
            alerts.push({
                code: 'RATE_LIMIT_FREQUENTLY_EXCEEDED',
                severity: IntegrationAlertSeverity.WARNING,
                message: `${rateLimitHits} rate-limit hit(s) were recorded today.`,
            });
        }

        if (failureCount > 0 && args.recentSuccessCount === 0) {
            alerts.push({
                code: 'NO_SUCCESSFUL_CALLS_24H',
                severity: IntegrationAlertSeverity.INFO,
                message: 'Failures exist and no successful quote call was recorded in the last 24 hours.',
            });
        }

        return alerts;
    }

    private utcDayStart(date: Date): Date {
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    }

}
