import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { RequestUser } from '../interfaces/request.interface';
import { User } from '../../modules/users/entities/user.entity';
import {
    AuditActor,
    AuditLogCategory,
    AuditLogRecord,
    AuditLogSeverity,
    CreateAuditLogInput,
    ListAuditLogsQuery,
    PaginatedAuditLogs,
} from './audit.types';
import { applyCreateAudit, applyUpdateAudit } from './audit.utils';
import { SystemLog } from './system-log.entity';

const SENSITIVE_METADATA_KEYWORDS = [
    'password',
    'token',
    'secret',
    'rawbody',
    'raw_body',
    'rawrequestbody',
    'raw_request_body',
    'signature',
    'authorization',
    'auth_header',
    'card',
    'cvv',
    'cvc',
    'stripe_secret',
];

@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);

    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(SystemLog)
        private readonly systemLogRepo: Repository<SystemLog>,
    ) { }

    async resolveActor(currentUser?: RequestUser | null): Promise<AuditActor> {
        if (!currentUser?.id) {
            return this.systemActor();
        }

        let email = currentUser.email ?? null;
        let firstName = currentUser.firstName ?? null;
        let lastName = currentUser.lastName ?? null;

        if (!email || (!firstName && !lastName)) {
            const persistedUser = await this.userRepo.findOne({
                where: { id: currentUser.id },
                select: ['id', 'email', 'firstName', 'lastName'],
                withDeleted: true,
            });

            email = email ?? persistedUser?.email ?? null;
            firstName = firstName ?? persistedUser?.firstName ?? null;
            lastName = lastName ?? persistedUser?.lastName ?? null;
        }

        return {
            userId: currentUser.id,
            email,
            role: currentUser.role ?? null,
            name: this.buildActorName(currentUser.displayName, firstName, lastName, email, currentUser.id),
        };
    }

    systemActor(): AuditActor {
        return {
            userId: null,
            name: 'System',
            email: null,
            role: 'SYSTEM',
        };
    }

    async log(input: CreateAuditLogInput): Promise<void> {
        try {
            const actor = input.actor ?? null;
            await this.systemLogRepo.save(this.systemLogRepo.create({
                eventType: input.eventType,
                category: input.category,
                severity: input.severity ?? AuditLogSeverity.INFO,
                message: input.message,
                actorUserId: input.actorUserId ?? actor?.userId ?? null,
                actorEmail: input.actorEmail ?? actor?.email ?? null,
                actorRole: input.actorRole ?? actor?.role ?? null,
                tenantId: input.tenantId ?? null,
                tenantName: input.tenantName ?? null,
                targetType: input.targetType ?? null,
                targetId: input.targetId == null ? null : String(input.targetId),
                metadata: this.sanitizeMetadata(input.metadata),
                ipAddress: input.ipAddress ?? null,
                userAgent: input.userAgent ?? null,
            }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown audit log write error';
            this.logger.warn(`Audit log write failed for ${input.eventType}: ${message}`);
        }
    }

    logAuth(input: Omit<CreateAuditLogInput, 'category'>): Promise<void> {
        return this.log({ ...input, category: AuditLogCategory.AUTH });
    }

    logBilling(input: Omit<CreateAuditLogInput, 'category'>): Promise<void> {
        return this.log({ ...input, category: AuditLogCategory.BILLING });
    }

    logTenant(input: Omit<CreateAuditLogInput, 'category'>): Promise<void> {
        return this.log({ ...input, category: AuditLogCategory.TENANT });
    }

    logWebhook(input: Omit<CreateAuditLogInput, 'category'>): Promise<void> {
        return this.log({ ...input, category: AuditLogCategory.WEBHOOK });
    }

    async list(query: ListAuditLogsQuery = {}): Promise<PaginatedAuditLogs> {
        const page = this.clampInteger(query.page, 1, 1, 10_000);
        const limit = this.clampInteger(query.limit, 25, 1, 100);

        const builder = this.systemLogRepo
            .createQueryBuilder('log')
            .orderBy('log.createdAt', 'DESC')
            .addOrderBy('log.id', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        if (query.category && Object.values(AuditLogCategory).includes(query.category)) {
            builder.andWhere('log.category = :category', { category: query.category });
        }

        if (query.severity && Object.values(AuditLogSeverity).includes(query.severity)) {
            builder.andWhere('log.severity = :severity', { severity: query.severity });
        }

        if (query.tenantId !== undefined && Number.isInteger(Number(query.tenantId))) {
            builder.andWhere('log.tenantId = :tenantId', { tenantId: Number(query.tenantId) });
        }

        if (query.from) {
            const from = new Date(query.from);
            if (!Number.isNaN(from.getTime())) {
                builder.andWhere('log.createdAt >= :from', { from });
            }
        }

        if (query.to) {
            const to = new Date(query.to);
            if (!Number.isNaN(to.getTime())) {
                if (!query.to.includes('T')) {
                    to.setUTCHours(23, 59, 59, 999);
                }
                builder.andWhere('log.createdAt <= :to', { to });
            }
        }

        const search = query.search?.trim();
        if (search) {
            builder.andWhere(new Brackets((qb) => {
                qb.where('log.message LIKE :search', { search: `%${search}%` })
                    .orWhere('log.eventType LIKE :search', { search: `%${search}%` })
                    .orWhere('log.actorEmail LIKE :search', { search: `%${search}%` })
                    .orWhere('log.tenantName LIKE :search', { search: `%${search}%` })
                    .orWhere('log.targetType LIKE :search', { search: `%${search}%` })
                    .orWhere('log.targetId LIKE :search', { search: `%${search}%` });
            }));
        }

        const [items, total] = await builder.getManyAndCount();
        return {
            items: items.map((log) => this.toRecord(log)),
            page,
            limit,
            total,
        };
    }

    applyCreateAudit = applyCreateAudit;

    applyUpdateAudit = applyUpdateAudit;

    legacyActorLabel(actor: AuditActor): string {
        return actor.name ?? actor.email ?? 'System';
    }

    private buildActorName(
        displayName: string | null | undefined,
        firstName: string | null,
        lastName: string | null,
        email: string | null,
        userId: number,
    ): string {
        const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
        if (displayName?.trim()) return displayName.trim();
        if (combinedName) return combinedName;
        if (email) return email;
        return `User #${userId}`;
    }

    private clampInteger(value: unknown, fallback: number, min: number, max: number): number {
        const parsed = Number(value);
        if (!Number.isInteger(parsed)) return fallback;
        return Math.min(Math.max(parsed, min), max);
    }

    private sanitizeMetadata(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
        if (!value) return null;
        const sanitized = this.sanitizeValue(value);
        return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
            ? sanitized as Record<string, unknown>
            : null;
    }

    private sanitizeValue(value: unknown): unknown {
        if (Array.isArray(value)) {
            return value.map((item) => this.sanitizeValue(item));
        }

        if (value && typeof value === 'object') {
            return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, nested]) => {
                if (this.isSensitiveKey(key)) {
                    acc[key] = '[REDACTED]';
                } else {
                    acc[key] = this.sanitizeValue(nested);
                }
                return acc;
            }, {});
        }

        return value;
    }

    private isSensitiveKey(key: string): boolean {
        const normalized = key.toLowerCase().replace(/[-\s]/g, '_');
        return SENSITIVE_METADATA_KEYWORDS.some((keyword) => normalized.includes(keyword));
    }

    private toRecord(log: SystemLog): AuditLogRecord {
        return {
            id: log.id,
            eventType: log.eventType,
            category: log.category,
            severity: log.severity,
            message: log.message,
            actorUserId: log.actorUserId,
            actorEmail: log.actorEmail,
            actorRole: log.actorRole,
            tenantId: log.tenantId,
            tenantName: log.tenantName,
            targetType: log.targetType,
            targetId: log.targetId,
            metadata: this.sanitizeMetadata(log.metadata),
            ipAddress: log.ipAddress,
            userAgent: log.userAgent,
            createdAt: log.createdAt.toISOString(),
        };
    }
}
