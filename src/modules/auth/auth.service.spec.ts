import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../../common/constants/enums';
import { AuditService } from '../../common/audit/audit.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Tenant } from '../tenants/entities/tenant.entity';
import { ConfigService } from '@nestjs/config';

jest.mock('bcrypt');
jest.mock('crypto', () => ({
    randomUUID: jest.fn(() => 'test-uuid-1234'),
}));

describe('AuthService', () => {
    let service: AuthService;

    const mockUsersService = {
        findAdmin: jest.fn(),
        createSeedAdmin: jest.fn(),
        findByEmail: jest.fn(),
        createInvitedUser: jest.fn(),
        update: jest.fn(),
        findByInvitationToken: jest.fn(),
        save: jest.fn(),
        findByResetToken: jest.fn(),
    };

    const mockJwtService = {
        sign: jest.fn(),
    };

    const mockMailService = {
        sendUserInvitation: jest.fn(),
        sendPasswordReset: jest.fn(),
    };

    const mockTenantRepo = {
        create: jest.fn((data: Partial<Tenant>): Partial<Tenant> => ({ ...data })),
        save: jest.fn(),
    };

    const mockAuditService = {
        log: jest.fn(),
        logAuth: jest.fn(),
        resolveActor: jest.fn().mockResolvedValue({ userId: null, email: null, role: 'SYSTEM', name: 'System' }),
    };

    const mockConfigService = {
        get: jest.fn(),
    };

    const mockUser = {
        id: 1,
        email: 'test@test.com',
        firstName: 'Test',
        lastName: 'User',
        password: 'hashed-password',
        role: UserRole.COMMERCIAL,
        isActive: true,
        hotels: [{ id: 1 }],
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: UsersService, useValue: mockUsersService },
                { provide: JwtService, useValue: mockJwtService },
                { provide: MailService, useValue: mockMailService },
                { provide: AuditService, useValue: mockAuditService },
                { provide: ConfigService, useValue: mockConfigService },
                { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
        jest.clearAllMocks();
        const seedConfig: Record<string, string> = {
            INITIAL_ADMIN_EMAIL: 'admin@example.test',
            INITIAL_ADMIN_PASSWORD: 'initial-password',
            INITIAL_ADMIN_FIRST_NAME: 'Initial',
            INITIAL_ADMIN_LAST_NAME: 'Admin',
            INTERNAL_TENANT_NAME: 'Internal Pricify',
        };
        mockConfigService.get.mockImplementation((key: string) => seedConfig[key]);
        mockTenantRepo.create.mockImplementation((data: Partial<Tenant>): Partial<Tenant> => ({ ...data }));
        mockTenantRepo.save.mockImplementation((tenant: Partial<Tenant>) => Promise.resolve({ id: 1, ...tenant }));
    });

    describe('onModuleInit', () => {
        it('should do nothing if admin exists', async () => {
            mockUsersService.findAdmin.mockResolvedValue(mockUser);
            await service.onModuleInit();
            expect(mockUsersService.createSeedAdmin).not.toHaveBeenCalled();
        });

        it('should skip seed admin creation if first-run credentials are not configured', async () => {
            mockUsersService.findAdmin.mockResolvedValue(null);
            mockConfigService.get.mockReturnValue(undefined);

            await service.onModuleInit();

            expect(mockTenantRepo.save).not.toHaveBeenCalled();
            expect(mockUsersService.createSeedAdmin).not.toHaveBeenCalled();
        });

        it('should create seed admin if none exists', async () => {
            mockUsersService.findAdmin.mockResolvedValue(null);
            (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-admin-password');
            mockUsersService.createSeedAdmin.mockResolvedValue({ email: 'admin@example.test' });

            await service.onModuleInit();
            expect(mockTenantRepo.save).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Internal Pricify',
                isActive: true,
            }));
            expect(mockUsersService.createSeedAdmin).toHaveBeenCalledWith(expect.objectContaining({
                email: 'admin@example.test',
                firstName: 'Initial',
                lastName: 'Admin',
                password: 'hashed-admin-password',
                role: UserRole.ADMIN,
                tenantId: 1,
            }));
        });
    });

    describe('login', () => {
        it('should throw UnauthorizedException if user not found', async () => {
            mockUsersService.findByEmail.mockResolvedValue(null);
            await expect(service.login({ email: 'test@test.com', password: 'password' })).rejects.toThrow(UnauthorizedException);
            expect(mockAuditService.logAuth).toHaveBeenCalledWith(expect.objectContaining({
                eventType: 'LOGIN_FAILED',
                actorEmail: 'test@test.com',
            }));
        });

        it('should throw UnauthorizedException if password invalid', async () => {
            mockUsersService.findByEmail.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);
            await expect(service.login({ email: 'test@test.com', password: 'wrong-password' })).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException if user inactive', async () => {
            mockUsersService.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            await expect(service.login({ email: 'test@test.com', password: 'password' })).rejects.toThrow(UnauthorizedException);
        });

        it('should return token and user data on success', async () => {
            mockUsersService.findByEmail.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            mockJwtService.sign.mockReturnValue('jwt-token');

            const result = await service.login({ email: 'test@test.com', password: 'password' });
            expect(result.accessToken).toEqual('jwt-token');
            expect(result.user.email).toEqual(mockUser.email);
            expect(mockAuditService.logAuth).toHaveBeenCalledWith(expect.objectContaining({
                eventType: 'LOGIN_SUCCESS',
                actorEmail: mockUser.email,
            }));
        });

        it('should handle users without hotels during login', async () => {
            mockUsersService.findByEmail.mockResolvedValue({ ...mockUser, hotels: undefined });
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            mockJwtService.sign.mockReturnValue('jwt-token');

            const result = await service.login({ email: 'test@test.com', password: 'password' });
            expect(result.accessToken).toEqual('jwt-token');
            expect(mockJwtService.sign).toHaveBeenCalledWith(expect.objectContaining({ hotelIds: [] }));
        });
    });

    describe('invite', () => {
        it('should throw BadRequestException if COMMERCIAL has no hotels', async () => {
            const dto1 = { email: 'test@test.com', role: UserRole.COMMERCIAL, hotelIds: [] };
            const dto2 = { email: 'test@test.com', role: UserRole.COMMERCIAL };
            await expect(service.invite(dto1, { tenantId: 1 })).rejects.toThrow(BadRequestException);
            await expect(service.invite(dto2, { tenantId: 1 })).rejects.toThrow(BadRequestException);
        });

        it('should invite user and assign hotels for COMMERCIAL', async () => {
            const invitedUser = { id: 2, email: 'new@test.com' };
            mockUsersService.createInvitedUser.mockResolvedValue(invitedUser);
            const dto = { email: 'new@test.com', role: UserRole.COMMERCIAL, hotelIds: [1] };

            const result = await service.invite(dto, { tenantId: 1 });
            
            expect(mockUsersService.createInvitedUser).toHaveBeenCalled();
            expect(mockUsersService.update).toHaveBeenCalledWith(2, { hotelIds: [1] });
            expect(mockMailService.sendUserInvitation).toHaveBeenCalled();
            expect(mockAuditService.log).toHaveBeenCalledWith(expect.objectContaining({
                eventType: 'USER_INVITED',
                targetId: 2,
            }));
            expect(result.message).toContain('Invitation sent');
        });

        it('should invite ADMIN without hotels', async () => {
            const invitedUser = { id: 3, email: 'admin@test.com' };
            mockUsersService.createInvitedUser.mockResolvedValue(invitedUser);

            await service.invite({ email: 'admin@test.com', role: UserRole.ADMIN }, { tenantId: 1 });
            
            expect(mockUsersService.createInvitedUser).toHaveBeenCalled();
            expect(mockUsersService.update).not.toHaveBeenCalled(); // Admins don't get specific hotels assigned
            expect(mockMailService.sendUserInvitation).toHaveBeenCalled();
        });

        it('should invite AGENT and assign hotels', async () => {
            const invitedUser = { id: 4, email: 'agent@test.com' };
            mockUsersService.createInvitedUser.mockResolvedValue(invitedUser);

            await service.invite({ email: 'agent@test.com', role: UserRole.AGENT, hotelIds: [1] }, { tenantId: 1 });

            expect(mockUsersService.createInvitedUser).toHaveBeenCalledWith(expect.objectContaining({
                email: 'agent@test.com',
                role: UserRole.AGENT,
                tenantId: 1,
            }));
            expect(mockUsersService.update).toHaveBeenCalledWith(4, { hotelIds: [1] });
            expect(mockMailService.sendUserInvitation).toHaveBeenCalled();
        });

    });

    describe('acceptInvite', () => {
        it('should throw BadRequestException if token invalid', async () => {
            mockUsersService.findByInvitationToken.mockResolvedValue(null);
            await expect(service.acceptInvite({ token: 'invalid', firstName: 'A', lastName: 'B', password: 'P' }))
                .rejects
                .toThrow('This invitation is no longer valid. Please contact your organization administrator.');
        });

        it('should return a generic invalid invite error for canceled invite records', async () => {
            mockUsersService.findByInvitationToken.mockResolvedValue({ ...mockUser, isActive: false, invitationToken: null, invitationCanceledAt: new Date() });

            await expect(service.acceptInvite({ token: 'removed', firstName: 'A', lastName: 'B', password: 'P' }))
                .rejects
                .toThrow('This invitation is no longer valid. Please contact your organization administrator.');
        });

        it('should activate user and return token', async () => {
            const invitedUser = { ...mockUser, isActive: false, invitationToken: 'token' };
            mockUsersService.findByInvitationToken.mockResolvedValue(invitedUser);
            (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
            mockJwtService.sign.mockReturnValue('new-jwt');

            const result = await service.acceptInvite({ token: 'token', firstName: 'A', lastName: 'B', password: 'P' });

            expect(mockUsersService.save).toHaveBeenCalledWith(expect.objectContaining({
                isActive: true,
                firstName: 'A',
                lastName: 'B',
                password: 'new-hashed-password',
                invitationToken: null
            }));
            expect(mockAuditService.log).toHaveBeenCalledWith(expect.objectContaining({
                eventType: 'INVITE_ACCEPTED',
                actorEmail: invitedUser.email,
            }));
            expect(result.accessToken).toEqual('new-jwt');
        });
        
        it('should handle users without hotels during acceptInvite', async () => {
            const invitedUser = { ...mockUser, isActive: false, invitationToken: 'token', hotels: undefined };
            mockUsersService.findByInvitationToken.mockResolvedValue(invitedUser);
            (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
            mockJwtService.sign.mockReturnValue('new-jwt');

            await service.acceptInvite({ token: 'token', firstName: 'A', lastName: 'B', password: 'P' });
            expect(mockJwtService.sign).toHaveBeenCalledWith(expect.objectContaining({ hotelIds: [] }));
        });
    });

    describe('forgotPassword', () => {
        it('should always return success message even if user not found (security)', async () => {
            mockUsersService.findByEmail.mockResolvedValue(null);
            const result = await service.forgotPassword({ email: 'unknown@test.com' });
            expect(result.message).toContain('reset link has been sent');
            expect(mockMailService.sendPasswordReset).not.toHaveBeenCalled();
        });

        it('should set reset token and send email if user exists and is active', async () => {
            mockUsersService.findByEmail.mockResolvedValue(mockUser);
            const result = await service.forgotPassword({ email: 'test@test.com' });
            
            expect(mockUsersService.save).toHaveBeenCalledWith(expect.objectContaining({
                resetPasswordToken: 'test-uuid-1234'
            }));
            expect(mockMailService.sendPasswordReset).toHaveBeenCalledWith('test@test.com', 'test-uuid-1234');
            expect(result.message).toContain('reset link has been sent');
        });
    });

    describe('resetPassword', () => {
        it('should throw BadRequestException if token invalid', async () => {
            mockUsersService.findByResetToken.mockResolvedValue(null);
            await expect(service.resetPassword({ token: 'invalid', newPassword: 'P' })).rejects.toThrow(BadRequestException);
        });

        it('should reset password and clear token', async () => {
            const resettingUser = { ...mockUser, resetPasswordToken: 'token' };
            mockUsersService.findByResetToken.mockResolvedValue(resettingUser);
            (bcrypt.hash as jest.Mock).mockResolvedValue('reset-hashed-password');

            const result = await service.resetPassword({ token: 'token', newPassword: 'new-pass' });

            expect(mockUsersService.save).toHaveBeenCalledWith(expect.objectContaining({
                password: 'reset-hashed-password',
                resetPasswordToken: null
            }));
            expect(result.message).toContain('successfully');
        });
    });
});
