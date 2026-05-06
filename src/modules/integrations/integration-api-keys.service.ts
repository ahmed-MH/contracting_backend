import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { isIP } from 'net';
import { IsNull, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/interfaces/request.interface';
import { IntegrationApiKeyEnvironment, IntegrationApiKeyStatus } from '../../common/constants/enums';
import { CreateIntegrationApiKeyDto, RotateIntegrationApiKeyDto, UpdateIntegrationApiKeyDto } from './dto/integration-api-key.dto';
import { IntegrationApiKey } from './entities/integration-api-key.entity';
import { IntegrationApiUser } from './entities/integration-api-user.entity';
import { IntegrationPublicError } from './integration-public-error';

export interface CreatedIntegrationApiKeyResult {
    apiKey: Omit<IntegrationApiKey, 'hashedSecret'>;
    rawKey: string;
}

export interface AuthenticatedIntegrationApiKey {
    apiKey: IntegrationApiKey;
    apiUser: IntegrationApiUser;
}

@Injectable()
export class IntegrationApiKeysService {
    constructor(
        @InjectRepository(IntegrationApiKey)
        private readonly apiKeyRepo: Repository<IntegrationApiKey>,
        @InjectRepository(IntegrationApiUser)
        private readonly apiUserRepo: Repository<IntegrationApiUser>,
        private readonly auditService: AuditService,
    ) { }

    async findAllForTenant(tenantId: number | null): Promise<IntegrationApiKey[]> {
        return this.apiKeyRepo.find({
            where: { apiUser: { tenantId: tenantId ?? IsNull() } },
            relations: ['apiUser'],
            order: { createdAt: 'DESC', id: 'DESC' },
        });
    }

    async create(dto: CreateIntegrationApiKeyDto, currentUser: RequestUser): Promise<CreatedIntegrationApiKeyResult> {
        const apiUser = await this.apiUserRepo.findOne({
            where: { id: dto.apiUserId, tenantId: currentUser.tenantId ?? IsNull() },
        });
        if (!apiUser) {
            throw new NotFoundException(`Integration API user #${dto.apiUserId} not found`);
        }

        const { rawSecret, prefix, hashedSecret } = await this.generateKeyMaterial(dto.environment ?? IntegrationApiKeyEnvironment.TEST);
        const actor = await this.auditService.resolveActor(currentUser);
        const allowedIps = this.normalizeAllowedIps(dto.allowedIps);

        const apiKey = this.apiKeyRepo.create({
            apiUserId: apiUser.id,
            name: dto.name,
            prefix,
            hashedSecret,
            status: IntegrationApiKeyStatus.ACTIVE,
            environment: dto.environment ?? IntegrationApiKeyEnvironment.TEST,
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            lastUsedAt: null,
            allowedIps,
            rotatedFromKeyId: null,
            rotatedToKeyId: null,
        });
        this.auditService.applyCreateAudit(apiKey, actor);

        const saved = await this.apiKeyRepo.save(apiKey);
        return {
            apiKey: this.toSafeApiKey(saved),
            rawKey: `${prefix}.${rawSecret}`,
        };
    }

    async update(id: number, dto: UpdateIntegrationApiKeyDto, currentUser: RequestUser): Promise<IntegrationApiKey> {
        const apiKey = await this.findScopedKey(id, currentUser);
        if (dto.name !== undefined) apiKey.name = dto.name;
        if (dto.expiresAt !== undefined) apiKey.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
        if (dto.allowedIps !== undefined) apiKey.allowedIps = this.normalizeAllowedIps(dto.allowedIps);

        const actor = await this.auditService.resolveActor(currentUser);
        this.auditService.applyUpdateAudit(apiKey, actor);
        return this.apiKeyRepo.save(apiKey);
    }

    async rotate(id: number, dto: RotateIntegrationApiKeyDto, currentUser: RequestUser): Promise<CreatedIntegrationApiKeyResult> {
        const oldKey = await this.findScopedKey(id, currentUser);
        const { rawSecret, prefix, hashedSecret } = await this.generateKeyMaterial(oldKey.environment);
        const actor = await this.auditService.resolveActor(currentUser);

        const replacement = this.apiKeyRepo.create({
            apiUserId: oldKey.apiUserId,
            name: dto.name ?? `${oldKey.name} rotation`,
            prefix,
            hashedSecret,
            status: IntegrationApiKeyStatus.ACTIVE,
            environment: oldKey.environment,
            expiresAt: dto.expiresAt !== undefined
                ? (dto.expiresAt ? new Date(dto.expiresAt) : null)
                : oldKey.expiresAt,
            lastUsedAt: null,
            allowedIps: dto.allowedIps !== undefined
                ? this.normalizeAllowedIps(dto.allowedIps)
                : oldKey.allowedIps,
            rotatedFromKeyId: oldKey.id,
            rotatedToKeyId: null,
        });
        this.auditService.applyCreateAudit(replacement, actor);
        const savedReplacement = await this.apiKeyRepo.save(replacement);

        oldKey.rotatedToKeyId = savedReplacement.id;
        this.auditService.applyUpdateAudit(oldKey, actor);
        await this.apiKeyRepo.save(oldKey);

        return {
            apiKey: this.toSafeApiKey(savedReplacement),
            rawKey: `${prefix}.${rawSecret}`,
        };
    }

    async revoke(id: number, currentUser: RequestUser): Promise<IntegrationApiKey> {
        const apiKey = await this.findScopedKey(id, currentUser);

        apiKey.status = IntegrationApiKeyStatus.REVOKED;
        const actor = await this.auditService.resolveActor(currentUser);
        this.auditService.applyUpdateAudit(apiKey, actor);
        return this.apiKeyRepo.save(apiKey);
    }

    async authenticate(rawKey: string | undefined): Promise<AuthenticatedIntegrationApiKey> {
        const parsed = this.parseRawKey(rawKey);
        if (!parsed) {
            throw new IntegrationPublicError('INVALID_API_KEY', 401, 'The API key is missing or malformed.');
        }

        const apiKey = await this.apiKeyRepo
            .createQueryBuilder('apiKey')
            .addSelect('apiKey.hashedSecret')
            .leftJoinAndSelect('apiKey.apiUser', 'apiUser')
            .leftJoinAndSelect('apiUser.allowedHotels', 'allowedHotels')
            .where('apiKey.prefix = :prefix', { prefix: parsed.prefix })
            .getOne();

        if (!apiKey) {
            throw new IntegrationPublicError('INVALID_API_KEY', 401, 'The API key is invalid.');
        }

        const isSecretValid = await bcrypt.compare(parsed.secret, apiKey.hashedSecret);
        if (!isSecretValid) {
            throw new IntegrationPublicError('INVALID_API_KEY', 401, 'The API key is invalid.');
        }

        if (apiKey.status === IntegrationApiKeyStatus.REVOKED) {
            throw new IntegrationPublicError('INVALID_API_KEY', 401, 'The API key has been revoked.');
        }

        if (apiKey.status === IntegrationApiKeyStatus.EXPIRED) {
            throw new IntegrationPublicError('INVALID_API_KEY', 401, 'The API key has expired.');
        }

        if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) {
            await this.apiKeyRepo.update(apiKey.id, {
                status: IntegrationApiKeyStatus.EXPIRED,
            });
            throw new IntegrationPublicError('INVALID_API_KEY', 401, 'The API key has expired.');
        }

        return {
            apiKey,
            apiUser: apiKey.apiUser,
        };
    }

    assertIpAllowed(apiKey: IntegrationApiKey, ipAddress: string | null): void {
        const allowedIps = apiKey.allowedIps ?? [];
        if (allowedIps.length === 0) return;

        if (!ipAddress || !allowedIps.some((entry) => this.ipMatches(ipAddress, entry))) {
            throw new IntegrationPublicError('IP_NOT_ALLOWED', 403, 'The request IP address is not allowed for this API key.');
        }
    }

    async markUsed(apiKeyId: number): Promise<void> {
        await this.apiKeyRepo.update(apiKeyId, {
            lastUsedAt: new Date(),
        });
    }

    private async findScopedKey(id: number, currentUser: RequestUser): Promise<IntegrationApiKey> {
        const apiKey = await this.apiKeyRepo.findOne({
            where: { id, apiUser: { tenantId: currentUser.tenantId ?? IsNull() } },
            relations: ['apiUser', 'rotatedFrom', 'rotatedTo'],
        });
        if (!apiKey) {
            throw new NotFoundException(`Integration API key #${id} not found`);
        }

        return apiKey;
    }

    private async generateKeyMaterial(environment: IntegrationApiKeyEnvironment): Promise<{
        rawSecret: string;
        prefix: string;
        hashedSecret: string;
    }> {
        const rawSecret = randomBytes(24).toString('base64url');
        const prefixBase = environment === IntegrationApiKeyEnvironment.PRODUCTION ? 'pk_live' : 'pk_test';
        const prefix = `${prefixBase}_${randomBytes(4).toString('hex')}`;
        const hashedSecret = await bcrypt.hash(rawSecret, 10);
        return { rawSecret, prefix, hashedSecret };
    }

    private normalizeAllowedIps(allowedIps?: string[] | null): string[] {
        const normalized = Array.from(new Set((allowedIps ?? []).map((ip) => ip.trim()).filter(Boolean)));
        const invalid = normalized.find((ip) => !this.isValidIpRule(ip));
        if (invalid) {
            throw new BadRequestException(`Invalid IP allowlist entry: ${invalid}`);
        }
        return normalized;
    }

    private isValidIpRule(value: string): boolean {
        const [address, prefixLengthValue, extra] = value.split('/');
        if (extra !== undefined || !isIP(address)) {
            return false;
        }

        if (prefixLengthValue === undefined) {
            return true;
        }

        const prefixLength = Number(prefixLengthValue);
        if (!Number.isInteger(prefixLength)) {
            return false;
        }

        return isIP(address) === 4
            ? prefixLength >= 0 && prefixLength <= 32
            : prefixLength >= 0 && prefixLength <= 128;
    }

    private ipMatches(ipAddress: string, rule: string): boolean {
        const ip = ipAddress.replace(/^::ffff:/, '').trim();
        const normalizedRule = rule.replace(/^::ffff:/, '').trim();
        if (!normalizedRule.includes('/')) {
            return ip.toLowerCase() === normalizedRule.toLowerCase();
        }

        const [network, prefixLengthValue] = normalizedRule.split('/');
        const prefixLength = Number(prefixLengthValue);
        if (isIP(network) === 4 && isIP(ip) === 4) {
            const ipNumber = this.ipv4ToNumber(ip);
            const networkNumber = this.ipv4ToNumber(network);
            if (ipNumber == null || networkNumber == null || prefixLength < 0 || prefixLength > 32) {
                return false;
            }

            const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
            return (ipNumber & mask) === (networkNumber & mask);
        }

        if (isIP(network) === 6 && isIP(ip) === 6) {
            const ipNumber = this.ipv6ToBigInt(ip);
            const networkNumber = this.ipv6ToBigInt(network);
            if (ipNumber == null || networkNumber == null || prefixLength < 0 || prefixLength > 128) {
                return false;
            }

            const mask = prefixLength === 0
                ? 0n
                : (((1n << BigInt(prefixLength)) - 1n) << BigInt(128 - prefixLength));
            return (ipNumber & mask) === (networkNumber & mask);
        }

        return false;
    }

    private ipv4ToNumber(value: string): number | null {
        const parts = value.split('.').map((part) => Number(part));
        if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
            return null;
        }

        return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
    }

    private ipv6ToBigInt(value: string): bigint | null {
        const sections = value.toLowerCase().split('::');
        if (sections.length > 2) return null;

        const head = sections[0] ? sections[0].split(':') : [];
        const tail = sections[1] ? sections[1].split(':') : [];
        const missingCount = 8 - head.length - tail.length;
        if (missingCount < 0) return null;

        const parts = sections.length === 1
            ? head
            : [...head, ...Array.from({ length: missingCount }, () => '0'), ...tail];
        if (parts.length !== 8) return null;

        return parts.reduce<bigint | null>((total, part) => {
            if (total == null || !/^[0-9a-f]{1,4}$/i.test(part)) return null;
            const parsed = Number.parseInt(part, 16);
            if (parsed < 0 || parsed > 0xffff) return null;
            return (total << 16n) + BigInt(parsed);
        }, 0n);
    }

    private parseRawKey(rawKey: string | undefined): { prefix: string; secret: string } | null {
        const value = rawKey?.trim();
        if (!value) return null;

        const separatorIndex = value.indexOf('.');
        if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
            return null;
        }

        return {
            prefix: value.slice(0, separatorIndex),
            secret: value.slice(separatorIndex + 1),
        };
    }

    private toSafeApiKey(apiKey: IntegrationApiKey): Omit<IntegrationApiKey, 'hashedSecret'> {
        const { hashedSecret: _hashedSecret, ...safeApiKey } = apiKey as IntegrationApiKey & { hashedSecret?: string };
        return safeApiKey;
    }
}
