import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { AuditService } from './audit.service';
import { AuditLogCategory, AuditLogSeverity } from './audit.types';
import { SystemLog } from './system-log.entity';

function createQueryBuilder(rows: SystemLog[], total: number) {
    return {
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
    };
}

function createTrackingQueryBuilder(rows: SystemLog[], total: number) {
    return {
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
    };
}

describe('AuditService', () => {
    let service: AuditService;
    const userRepo = {
        findOne: jest.fn(),
    };
    const systemLogRepo = {
        create: jest.fn((value) => value),
        save: jest.fn(),
        createQueryBuilder: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuditService,
                { provide: getRepositoryToken(User), useValue: userRepo },
                { provide: getRepositoryToken(SystemLog), useValue: systemLogRepo },
            ],
        }).compile();

        service = module.get(AuditService);
        jest.clearAllMocks();
    });

    it('does not throw when audit persistence fails', async () => {
        systemLogRepo.save.mockRejectedValue(new Error('database unavailable'));

        await expect(service.log({
            eventType: 'PLAN_CREATED',
            category: AuditLogCategory.PLAN,
            message: 'Plan was created',
        })).resolves.toBeUndefined();
    });

    it('sanitizes sensitive metadata before writing and returning logs', async () => {
        systemLogRepo.save.mockResolvedValue(undefined);

        await service.log({
            eventType: 'LOGIN_FAILED',
            category: AuditLogCategory.AUTH,
            severity: AuditLogSeverity.WARNING,
            message: 'Login failed',
            metadata: {
                password: 'secret',
                token: 'token',
                invitationToken: 'invite-token',
                resetPasswordToken: 'reset-token',
                stripeSecretKey: 'sk_test_secret',
                webhookSignature: 'sig',
                rawRequestBody: '{"secret":true}',
                authorizationHeader: 'Bearer abc',
                cardNumber: '4242424242424242',
                cvc: '123',
                cvv: '321',
                nested: { invitationToken: 'token-value', safe: true },
            },
        });

        expect(systemLogRepo.create).toHaveBeenCalledWith(expect.objectContaining({
            metadata: {
                password: '[REDACTED]',
                token: '[REDACTED]',
                invitationToken: '[REDACTED]',
                resetPasswordToken: '[REDACTED]',
                stripeSecretKey: '[REDACTED]',
                webhookSignature: '[REDACTED]',
                rawRequestBody: '[REDACTED]',
                authorizationHeader: '[REDACTED]',
                cardNumber: '[REDACTED]',
                cvc: '[REDACTED]',
                cvv: '[REDACTED]',
                nested: { invitationToken: '[REDACTED]', safe: true },
            },
        }));

        const log = {
            id: 1,
            eventType: 'LOGIN_FAILED',
            category: AuditLogCategory.AUTH,
            severity: AuditLogSeverity.WARNING,
            message: 'Login failed',
            actorUserId: null,
            actorEmail: null,
            actorRole: null,
            tenantId: null,
            tenantName: null,
            targetType: null,
            targetId: null,
            metadata: {
                resetPasswordToken: 'value',
                authorization: 'Bearer abc',
                rawBody: '{}',
                visible: 'ok',
            },
            ipAddress: null,
            userAgent: null,
            createdAt: new Date('2026-05-17T12:00:00.000Z'),
        } as SystemLog;
        systemLogRepo.createQueryBuilder.mockReturnValue(createQueryBuilder([log], 1));

        const result = await service.list({ page: 1, limit: 25 });

        expect(result.items[0].metadata).toEqual({
            resetPasswordToken: '[REDACTED]',
            authorization: '[REDACTED]',
            rawBody: '[REDACTED]',
            visible: 'ok',
        });
    });

    it('applies filters, pagination, and stable latest-first ordering', async () => {
        const qb = createTrackingQueryBuilder([], 0);
        systemLogRepo.createQueryBuilder.mockReturnValue(qb);

        await service.list({
            page: 2,
            limit: 10,
            category: AuditLogCategory.WEBHOOK,
            severity: AuditLogSeverity.ERROR,
            tenantId: 12,
            search: 'checkout',
            from: '2026-05-01',
            to: '2026-05-17',
        });

        expect(qb.orderBy).toHaveBeenCalledWith('log.createdAt', 'DESC');
        expect(qb.addOrderBy).toHaveBeenCalledWith('log.id', 'DESC');
        expect(qb.skip).toHaveBeenCalledWith(10);
        expect(qb.take).toHaveBeenCalledWith(10);
        expect(qb.andWhere).toHaveBeenCalledWith('log.category = :category', { category: AuditLogCategory.WEBHOOK });
        expect(qb.andWhere).toHaveBeenCalledWith('log.severity = :severity', { severity: AuditLogSeverity.ERROR });
        expect(qb.andWhere).toHaveBeenCalledWith('log.tenantId = :tenantId', { tenantId: 12 });
        expect(qb.andWhere).toHaveBeenCalledWith('log.createdAt >= :from', { from: new Date('2026-05-01') });
        expect(qb.andWhere).toHaveBeenCalledWith('log.createdAt <= :to', { to: new Date('2026-05-17T23:59:59.999Z') });
        expect(qb.andWhere).toHaveBeenCalledWith(expect.any(Object));
    });
});
