export interface AuditActor {
    userId: number | null;
    name: string | null;
    email: string | null;
    role?: string | null;
}

export interface AuditableShape {
    createdAt: Date;
    updatedAt: Date;
    createdByUserId: number | null;
    createdByName: string | null;
    createdByEmail: string | null;
    updatedByUserId: number | null;
    updatedByName: string | null;
    updatedByEmail: string | null;
}

export enum AuditLogCategory {
    AUTH = 'AUTH',
    TENANT = 'TENANT',
    PLAN = 'PLAN',
    SUBSCRIPTION = 'SUBSCRIPTION',
    BILLING = 'BILLING',
    WEBHOOK = 'WEBHOOK',
    INVITE = 'INVITE',
    ENTITLEMENT = 'ENTITLEMENT',
    SYSTEM = 'SYSTEM',
}

export enum AuditLogSeverity {
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    CRITICAL = 'CRITICAL',
}

export interface CreateAuditLogInput {
    eventType: string;
    category: AuditLogCategory;
    severity?: AuditLogSeverity;
    message: string;
    actorUserId?: number | null;
    actorEmail?: string | null;
    actorRole?: string | null;
    actor?: AuditActor | null;
    tenantId?: number | null;
    tenantName?: string | null;
    targetType?: string | null;
    targetId?: string | number | null;
    metadata?: Record<string, unknown> | null;
    ipAddress?: string | null;
    userAgent?: string | null;
}

export interface ListAuditLogsQuery {
    page?: number;
    limit?: number;
    category?: AuditLogCategory;
    severity?: AuditLogSeverity;
    tenantId?: number;
    search?: string;
    from?: string;
    to?: string;
}

export interface AuditLogRecord {
    id: number;
    eventType: string;
    category: AuditLogCategory;
    severity: AuditLogSeverity;
    message: string;
    actorUserId: number | null;
    actorEmail: string | null;
    actorRole: string | null;
    tenantId: number | null;
    tenantName: string | null;
    targetType: string | null;
    targetId: string | null;
    metadata: Record<string, unknown> | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
}

export interface PaginatedAuditLogs {
    items: AuditLogRecord[];
    page: number;
    limit: number;
    total: number;
}
