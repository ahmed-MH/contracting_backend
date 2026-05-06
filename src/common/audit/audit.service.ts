import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestUser } from '../interfaces/request.interface';
import { User } from '../../modules/users/entities/user.entity';
import { AuditActor } from './audit.types';
import { applyCreateAudit, applyUpdateAudit } from './audit.utils';

@Injectable()
export class AuditService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
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
            name: this.buildActorName(currentUser.displayName, firstName, lastName, email, currentUser.id),
        };
    }

    systemActor(): AuditActor {
        return {
            userId: null,
            name: 'System',
            email: null,
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
}
