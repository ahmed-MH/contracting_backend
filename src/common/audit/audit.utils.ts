import { AuditActor, AuditableShape } from './audit.types';

type AuditableTarget = Partial<AuditableShape>;

export function applyCreateAudit<T extends AuditableTarget>(
    entity: T,
    actor: AuditActor,
    timestamp: Date = new Date(),
): T {
    entity.createdAt = timestamp;
    entity.updatedAt = timestamp;
    entity.createdByUserId = actor.userId;
    entity.createdByName = actor.name;
    entity.createdByEmail = actor.email;
    entity.updatedByUserId = actor.userId;
    entity.updatedByName = actor.name;
    entity.updatedByEmail = actor.email;
    return entity;
}

export function applyUpdateAudit<T extends AuditableTarget>(
    entity: T,
    actor: AuditActor,
    timestamp: Date = new Date(),
): T {
    entity.updatedAt = timestamp;
    entity.updatedByUserId = actor.userId;
    entity.updatedByName = actor.name;
    entity.updatedByEmail = actor.email;
    return entity;
}
