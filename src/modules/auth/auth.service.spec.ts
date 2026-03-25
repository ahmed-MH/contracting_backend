import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../../common/constants/enums';

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
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
        jest.clearAllMocks();
    });

    describe('onModuleInit', () => {
        it('should do nothing if admin exists', async () => {
            mockUsersService.findAdmin.mockResolvedValue(mockUser);
            await service.onModuleInit();
            expect(mockUsersService.createSeedAdmin).not.toHaveBeenCalled();
        });

        it('should create seed admin if none exists', async () => {
            mockUsersService.findAdmin.mockResolvedValue(null);
            (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-admin-password');
            mockUsersService.createSeedAdmin.mockResolvedValue({ email: 'admin@marriott.com' });

            await service.onModuleInit();
            expect(mockUsersService.createSeedAdmin).toHaveBeenCalled();
        });
    });

    describe('login', () => {
        it('should throw UnauthorizedException if user not found', async () => {
            mockUsersService.findByEmail.mockResolvedValue(null);
            await expect(service.login({ email: 'test@test.com', password: 'password' })).rejects.toThrow(UnauthorizedException);
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
            await expect(service.invite({ email: 'test@test.com', role: UserRole.COMMERCIAL, hotelIds: [] })).rejects.toThrow(BadRequestException);
            await expect(service.invite({ email: 'test@test.com', role: UserRole.COMMERCIAL })).rejects.toThrow(BadRequestException);
        });

        it('should invite user and assign hotels for COMMERCIAL', async () => {
            const invitedUser = { id: 2, email: 'new@test.com' };
            mockUsersService.createInvitedUser.mockResolvedValue(invitedUser);

            const result = await service.invite({ email: 'new@test.com', role: UserRole.COMMERCIAL, hotelIds: [1] });
            
            expect(mockUsersService.createInvitedUser).toHaveBeenCalled();
            expect(mockUsersService.update).toHaveBeenCalledWith(2, { hotelIds: [1] });
            expect(mockMailService.sendUserInvitation).toHaveBeenCalled();
            expect(result.message).toContain('Invitation sent');
        });

        it('should invite ADMIN without hotels', async () => {
            const invitedUser = { id: 3, email: 'admin@test.com' };
            mockUsersService.createInvitedUser.mockResolvedValue(invitedUser);

            await service.invite({ email: 'admin@test.com', role: UserRole.ADMIN });
            
            expect(mockUsersService.createInvitedUser).toHaveBeenCalled();
            expect(mockUsersService.update).not.toHaveBeenCalled(); // Admins don't get specific hotels assigned
            expect(mockMailService.sendUserInvitation).toHaveBeenCalled();
        });
    });

    describe('acceptInvite', () => {
        it('should throw BadRequestException if token invalid', async () => {
            mockUsersService.findByInvitationToken.mockResolvedValue(null);
            await expect(service.acceptInvite({ token: 'invalid', firstName: 'A', lastName: 'B', password: 'P' })).rejects.toThrow(BadRequestException);
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
