import { AuditService } from '../common/audit/audit.service';
import { AuditActor } from '../common/audit/audit.types';

export type AuditServiceMock = {
    resolveActor: jest.MockedFunction<AuditService['resolveActor']>;
    systemActor: jest.MockedFunction<AuditService['systemActor']>;
    log: jest.MockedFunction<AuditService['log']>;
    logAuth: jest.MockedFunction<AuditService['logAuth']>;
    logTenant: jest.MockedFunction<AuditService['logTenant']>;
    applyCreateAudit: jest.Mock;
    applyUpdateAudit: jest.Mock;
    legacyActorLabel: jest.MockedFunction<AuditService['legacyActorLabel']>;
};

export function createAuditServiceMock(actor: AuditActor = {
    userId: 1,
    name: 'Test User',
    email: 'test@example.com',
    role: 'ADMIN',
}): AuditServiceMock {
    return {
        resolveActor: jest.fn(async () => actor),
        systemActor: jest.fn(() => ({ userId: null, name: 'System', email: null, role: 'SYSTEM' })),
        log: jest.fn(async (_input: Parameters<AuditService['log']>[0]) => undefined) as jest.MockedFunction<AuditService['log']>,
        logAuth: jest.fn(async (_input: Parameters<AuditService['logAuth']>[0]) => undefined) as jest.MockedFunction<AuditService['logAuth']>,
        logTenant: jest.fn(async (_input: Parameters<AuditService['logTenant']>[0]) => undefined) as jest.MockedFunction<AuditService['logTenant']>,
        applyCreateAudit: jest.fn((entity: unknown) => entity),
        applyUpdateAudit: jest.fn((entity: unknown) => entity),
        legacyActorLabel: jest.fn((auditActor: AuditActor) => auditActor.name ?? auditActor.email ?? 'System'),
    };
}
