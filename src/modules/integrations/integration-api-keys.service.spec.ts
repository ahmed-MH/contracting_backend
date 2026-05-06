import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { IntegrationApiKeyEnvironment, IntegrationApiKeyStatus } from '../../common/constants/enums';
import { AuditService } from '../../common/audit/audit.service';
import { IntegrationApiKey } from './entities/integration-api-key.entity';
import { IntegrationApiUser } from './entities/integration-api-user.entity';
import { IntegrationApiKeysService } from './integration-api-keys.service';

describe('IntegrationApiKeysService', () => {
    let service: IntegrationApiKeysService;

    const apiKeyRepo = {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        createQueryBuilder: jest.fn(),
    };

    const apiUserRepo = {
        findOne: jest.fn(),
    };

    const auditService = {
        resolveActor: jest.fn().mockResolvedValue({ userId: 1, name: 'Admin', email: 'admin@test.com' }),
        applyCreateAudit: jest.fn(),
        applyUpdateAudit: jest.fn(),
    };

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                IntegrationApiKeysService,
                { provide: getRepositoryToken(IntegrationApiKey), useValue: apiKeyRepo },
                { provide: getRepositoryToken(IntegrationApiUser), useValue: apiUserRepo },
                { provide: AuditService, useValue: auditService },
            ],
        }).compile();

        service = module.get(IntegrationApiKeysService);
        apiKeyRepo.create.mockImplementation((input) => input);
        apiKeyRepo.save.mockImplementation(async (input) => ({ id: 9, ...input }));
        apiUserRepo.findOne.mockResolvedValue({ id: 4, tenantId: 7 });
    });

    it('stores the API secret hashed and returns the raw key once', async () => {
        const result = await service.create(
            { apiUserId: 4, name: 'PMS connector' },
            { id: 1, email: 'admin@test.com', role: 'ADMIN' as any, hotelIds: [], tenantId: 7 } as any,
        );

        expect(result.rawKey).toMatch(/^pk_test_[a-f0-9]{8}\./);
        expect(apiKeyRepo.save).toHaveBeenCalled();
        const savedPayload = apiKeyRepo.save.mock.calls[0][0];
        const rawSecret = result.rawKey.split('.')[1];
        expect(savedPayload.hashedSecret).not.toBe(rawSecret);
        expect(savedPayload.environment).toBe(IntegrationApiKeyEnvironment.TEST);
        await expect(bcrypt.compare(rawSecret, savedPayload.hashedSecret)).resolves.toBe(true);
        expect(result.apiKey).not.toHaveProperty('hashedSecret');
    });

    it('stores production environment and uses a live prefix', async () => {
        const result = await service.create(
            { apiUserId: 4, name: 'PMS connector', environment: IntegrationApiKeyEnvironment.PRODUCTION },
            { id: 1, email: 'admin@test.com', role: 'ADMIN' as any, hotelIds: [], tenantId: 7 } as any,
        );

        expect(result.rawKey).toMatch(/^pk_live_[a-f0-9]{8}\./);
        expect(apiKeyRepo.save.mock.calls[0][0].environment).toBe(IntegrationApiKeyEnvironment.PRODUCTION);
    });

    it('rotates a key by creating a linked replacement and returning the raw key once', async () => {
        apiKeyRepo.findOne.mockResolvedValue({
            id: 9,
            apiUserId: 4,
            name: 'Current key',
            environment: IntegrationApiKeyEnvironment.TEST,
            expiresAt: null,
            allowedIps: ['127.0.0.1'],
        });
        apiKeyRepo.save
            .mockResolvedValueOnce({ id: 10, prefix: 'pk_test_new', hashedSecret: 'hash' })
            .mockResolvedValueOnce({ id: 9 });

        const result = await service.rotate(
            9,
            { name: 'Replacement key' },
            { id: 1, email: 'admin@test.com', role: 'ADMIN' as any, hotelIds: [], tenantId: 7 } as any,
        );

        expect(result.rawKey).toMatch(/^pk_test_[a-f0-9]{8}\./);
        expect(apiKeyRepo.save.mock.calls[0][0]).toMatchObject({
            apiUserId: 4,
            name: 'Replacement key',
            rotatedFromKeyId: 9,
            allowedIps: ['127.0.0.1'],
        });
        expect(apiKeyRepo.save.mock.calls[1][0]).toMatchObject({ rotatedToKeyId: 10 });
        expect(result.apiKey).not.toHaveProperty('hashedSecret');
    });

    it('allows matching IPs and blocks non-matching IPs', () => {
        const apiKey = { allowedIps: ['127.0.0.1', '10.10.0.0/16', '2001:db8::/32'] } as IntegrationApiKey;

        expect(() => service.assertIpAllowed(apiKey, '127.0.0.1')).not.toThrow();
        expect(() => service.assertIpAllowed(apiKey, '10.10.5.3')).not.toThrow();
        expect(() => service.assertIpAllowed(apiKey, '2001:db8::4')).not.toThrow();
        expect(() => service.assertIpAllowed(apiKey, '192.0.2.1')).toThrow(expect.objectContaining({
            errorCode: 'IP_NOT_ALLOWED',
        }));
    });

    it('authenticates a valid raw key', async () => {
        const rawSecret = 'super-secret-token';
        const hashedSecret = await bcrypt.hash(rawSecret, 10);
        const apiUser = { id: 4, tenantId: 7, allowedHotels: [{ id: 12 }], permissions: ['RESERVATIONS_QUOTE'] };
        const apiKey = {
            id: 9,
            prefix: 'pik_ab12cd34',
            hashedSecret,
            status: IntegrationApiKeyStatus.ACTIVE,
            apiUser,
            expiresAt: null,
        };

        const builder = {
            addSelect: jest.fn().mockReturnThis(),
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(apiKey),
        };
        apiKeyRepo.createQueryBuilder.mockReturnValue(builder);

        const result = await service.authenticate('pik_ab12cd34.super-secret-token');

        expect(result.apiKey).toBe(apiKey);
        expect(result.apiUser).toBe(apiUser);
    });

    it('rejects revoked keys', async () => {
        const hashedSecret = await bcrypt.hash('secret', 10);
        const builder = {
            addSelect: jest.fn().mockReturnThis(),
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue({
                id: 9,
                prefix: 'pik_revoked',
                hashedSecret,
                status: IntegrationApiKeyStatus.REVOKED,
                apiUser: { id: 4, tenantId: 7, allowedHotels: [] },
                expiresAt: null,
            }),
        };
        apiKeyRepo.createQueryBuilder.mockReturnValue(builder);

        await expect(service.authenticate('pik_revoked.secret')).rejects.toMatchObject({
            errorCode: 'INVALID_API_KEY',
        });
    });

    it('rejects expired keys and marks them expired', async () => {
        const hashedSecret = await bcrypt.hash('secret', 10);
        const builder = {
            addSelect: jest.fn().mockReturnThis(),
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue({
                id: 9,
                prefix: 'pik_expired',
                hashedSecret,
                status: IntegrationApiKeyStatus.ACTIVE,
                apiUser: { id: 4, tenantId: 7, allowedHotels: [] },
                expiresAt: new Date(Date.now() - 60_000),
            }),
        };
        apiKeyRepo.createQueryBuilder.mockReturnValue(builder);

        await expect(service.authenticate('pik_expired.secret')).rejects.toMatchObject({
            errorCode: 'INVALID_API_KEY',
        });
        expect(apiKeyRepo.update).toHaveBeenCalledWith(9, { status: IntegrationApiKeyStatus.EXPIRED });
    });

    it('rejects keys already marked as expired', async () => {
        const hashedSecret = await bcrypt.hash('secret', 10);
        const builder = {
            addSelect: jest.fn().mockReturnThis(),
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue({
                id: 9,
                prefix: 'pik_expired_flag',
                hashedSecret,
                status: IntegrationApiKeyStatus.EXPIRED,
                apiUser: { id: 4, tenantId: 7, allowedHotels: [] },
                expiresAt: null,
            }),
        };
        apiKeyRepo.createQueryBuilder.mockReturnValue(builder);

        await expect(service.authenticate('pik_expired_flag.secret')).rejects.toMatchObject({
            errorCode: 'INVALID_API_KEY',
        });
    });
});
