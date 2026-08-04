import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Hotel } from '../hotel/entities/hotel.entity';
import { UserRole } from '../../common/constants/enums';
import { AuditService } from '../../common/audit/audit.service';
import { ConflictException, BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('UsersService', () => {
    let service: UsersService;

    const mockUserRepo = {
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        count: jest.fn(),
        softDelete: jest.fn(),
        recover: jest.fn(),
    };

    const mockHotelRepo = {
        findByIds: jest.fn(),
    };

    const mockAuditService = {
        log: jest.fn(),
        logAuth: jest.fn(),
        resolveActor: jest.fn().mockResolvedValue({ userId: null, email: null, role: 'SYSTEM', name: 'System' }),
    };

    const mockUser = {
        id: 1,
        email: 'test@test.com',
        firstName: 'Test',
        lastName: 'User',
        password: 'password',
        role: UserRole.COMMERCIAL,
        isActive: true,
        hotels: [],
    } as any;

    const mockHotel = { id: 1, name: 'Test Hotel' } as any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersService,
                { provide: getRepositoryToken(User), useValue: mockUserRepo },
                { provide: getRepositoryToken(Hotel), useValue: mockHotelRepo },
                { provide: AuditService, useValue: mockAuditService },
            ],
        }).compile();

        service = module.get<UsersService>(UsersService);
        jest.clearAllMocks();
    });

    describe('findByEmail', () => {
        it('should return a user by email', async () => {
            mockUserRepo.findOne.mockResolvedValue(mockUser);
            const result = await service.findByEmail('test@test.com');
            expect(result).toEqual(mockUser);
            expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { email: 'test@test.com' }, relations: ['hotels'] });
        });
    });

    describe('findById', () => {
        it('should return a user by id', async () => {
            mockUserRepo.findOne.mockResolvedValue(mockUser);
            const result = await service.findById(1);
            expect(result).toEqual(mockUser);
            expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 }, relations: ['hotels', 'tenant'] });
        });
    });

    describe('findByInvitationToken', () => {
        it('should return a user by invitation token', async () => {
            mockUserRepo.findOne.mockResolvedValue(mockUser);
            const result = await service.findByInvitationToken('token');
            expect(result).toEqual(mockUser);
            expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { invitationToken: 'token', invitationCanceledAt: expect.any(Object) } });
        });
    });

    describe('findByResetToken', () => {
        it('should return a user by reset token', async () => {
            mockUserRepo.findOne.mockResolvedValue(mockUser);
            const result = await service.findByResetToken('token');
            expect(result).toEqual(mockUser);
            expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { resetPasswordToken: 'token' } });
        });
    });

    describe('findAdmin', () => {
        it('should return an admin user', async () => {
            mockUserRepo.findOne.mockResolvedValue(mockUser);
            const result = await service.findAdmin();
            expect(result).toEqual(mockUser);
            expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { role: UserRole.ADMIN } });
        });
    });

    describe('createInvitedUser', () => {
        it('should create an invited user', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);
            mockUserRepo.create.mockReturnValue(mockUser);
            mockUserRepo.save.mockResolvedValue(mockUser);

            const result = await service.createInvitedUser({ email: 'new@test.com', role: UserRole.COMMERCIAL, invitationToken: 'token' });
            expect(result).toEqual(mockUser);
        });

        it('should throw ConflictException if user exists', async () => {
            mockUserRepo.findOne.mockResolvedValue(mockUser);
            await expect(service.createInvitedUser({ email: 'test@test.com', role: UserRole.COMMERCIAL, invitationToken: 'token' }))
                .rejects.toThrow(ConflictException);
        });

        it('should reuse a canceled pending invite for the same tenant and email', async () => {
            const canceledInvite = {
                ...mockUser,
                isActive: false,
                password: null,
                tenantId: 1,
                invitationToken: null,
                invitationCanceledAt: new Date(),
                invitationCanceledByUserId: 7,
                hotels: [mockHotel],
            };
            mockUserRepo.findOne.mockResolvedValue(canceledInvite);
            mockUserRepo.save.mockImplementation(async (u) => u);

            const result = await service.createInvitedUser({
                email: 'test@test.com',
                role: UserRole.AGENT,
                invitationToken: 'new-token',
                tenantId: 1,
            });

            expect(result).toEqual(expect.objectContaining({
                role: UserRole.AGENT,
                invitationToken: 'new-token',
                invitationCanceledAt: null,
                invitationCanceledByUserId: null,
                isActive: false,
                hotels: [],
            }));
        });
    });

    describe('createSeedAdmin', () => {
        it('should create a seed admin', async () => {
            mockUserRepo.create.mockReturnValue(mockUser);
            mockUserRepo.save.mockResolvedValue(mockUser);

            const result = await service.createSeedAdmin({ email: 'admin@test.com', firstName: 'Admin', lastName: 'User', password: 'password', role: UserRole.ADMIN });
            expect(result).toEqual(mockUser);
        });
    });

    describe('save', () => {
        it('should save a user', async () => {
            mockUserRepo.save.mockResolvedValue(mockUser);
            const result = await service.save(mockUser);
            expect(result).toEqual(mockUser);
        });
    });

    describe('findAll', () => {
        it('should return all users without passwords', async () => {
            mockUserRepo.find.mockResolvedValue([mockUser]);
            const result = await service.findAll({ id: 1, role: UserRole.ADMIN, tenantId: 1 });
            expect(result[0]).not.toHaveProperty('password');
            expect(result[0].email).toEqual('test@test.com');
            expect(mockUserRepo.find).toHaveBeenCalledWith({ where: { tenantId: 1 }, relations: ['hotels'], withDeleted: true });
        });

        it('should hide canceled pending invites from tenant admins', async () => {
            mockUserRepo.find.mockResolvedValue([
                mockUser,
                { ...mockUser, id: 2, isActive: false, password: null, invitationCanceledAt: new Date() },
            ]);

            const result = await service.findAll({ id: 1, role: UserRole.ADMIN, tenantId: 1 });

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(mockUser.id);
        });
    });

    describe('cancelPendingInvite', () => {
        const adminUser = { id: 10, role: UserRole.ADMIN, tenantId: 1 } as any;

        it('should soft-cancel a pending invite in the same tenant', async () => {
            const pendingInvite = { ...mockUser, id: 2, tenantId: 1, role: UserRole.COMMERCIAL, isActive: false, password: null, invitationToken: 'token', hotels: [mockHotel] };
            mockUserRepo.findOne.mockResolvedValue(pendingInvite);
            mockUserRepo.save.mockImplementation(async (u) => u);

            const result = await service.cancelPendingInvite(2, adminUser);

            expect(mockUserRepo.save).toHaveBeenCalledWith(expect.objectContaining({
                invitationToken: null,
                invitationCanceledByUserId: 10,
                isActive: false,
                hotels: [],
            }));
            expect(pendingInvite.invitationCanceledAt).toBeInstanceOf(Date);
            expect(mockAuditService.log).toHaveBeenCalledWith(expect.objectContaining({
                eventType: 'INVITE_CANCELED',
                targetId: 2,
            }));
            expect(result).toEqual({ message: 'Pending invite removed. The invite link is no longer valid.', userId: 2 });
        });

        it('should reject active users', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, tenantId: 1, isActive: true, invitationToken: null });

            await expect(service.cancelPendingInvite(1, adminUser)).rejects.toThrow(BadRequestException);
        });

        it('should reject invites from another tenant without exposing the row', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, tenantId: 99, isActive: false, invitationToken: 'token' });

            await expect(service.cancelPendingInvite(1, adminUser)).rejects.toThrow(NotFoundException);
        });

        it('should reject non-admin callers', async () => {
            await expect(service.cancelPendingInvite(1, { id: 11, role: UserRole.COMMERCIAL, tenantId: 1 } as any))
                .rejects
                .toThrow(ForbiddenException);
        });

    });

    describe('update', () => {
        it('should update scalar fields', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser });
            mockUserRepo.save.mockImplementation(async (u) => u);

            const result = await service.update(1, { firstName: 'Updated', lastName: 'Name' });
            expect(result.firstName).toEqual('Updated');
            expect(result.lastName).toEqual('Name');
        });

        it('should throw ConflictException if user not found', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);
            await expect(service.update(1, { firstName: 'Updated' })).rejects.toThrow(ConflictException);
        });

        it('should clear hotels if role updated to ADMIN', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, role: UserRole.COMMERCIAL, hotels: [mockHotel] });
            mockUserRepo.save.mockImplementation(async (u) => u);

            const result = await service.update(1, { role: UserRole.ADMIN });
            expect(result.role).toEqual(UserRole.ADMIN);
            expect(result.hotels).toEqual([]);
        });

        it('should reject self-demotion when the current user is the only active admin', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, id: 1, role: UserRole.ADMIN, tenantId: 1, isActive: true });
            mockUserRepo.count.mockResolvedValue(1);

            await expect(service.update(
                1,
                { role: UserRole.COMMERCIAL, hotelIds: [1] },
                { id: 1, email: 'admin@test.com', role: UserRole.ADMIN, hotelIds: [], tenantId: 1 },
            )).rejects.toThrow(BadRequestException);
            expect(mockHotelRepo.findByIds).not.toHaveBeenCalled();
            expect(mockUserRepo.save).not.toHaveBeenCalled();
        });

        it('should allow self-demotion when another active admin remains', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, id: 1, role: UserRole.ADMIN, tenantId: 1, isActive: true, hotels: [] });
            mockUserRepo.count.mockResolvedValue(2);
            mockHotelRepo.findByIds.mockResolvedValue([mockHotel]);
            mockUserRepo.save.mockImplementation(async (u) => u);

            const result = await service.update(
                1,
                { role: UserRole.COMMERCIAL, hotelIds: [1] },
                { id: 1, email: 'admin@test.com', role: UserRole.ADMIN, hotelIds: [], tenantId: 1 },
            );

            expect(result.role).toEqual(UserRole.COMMERCIAL);
            expect(result.hotels).toEqual([mockHotel]);
        });

        it('should throw BadRequestException if COMMERCIAL updated with 0 hotels', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, role: UserRole.COMMERCIAL });
            await expect(service.update(1, { hotelIds: [] })).rejects.toThrow(BadRequestException);
        });

        it('should update hotels for COMMERCIAL', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, role: UserRole.COMMERCIAL });
            mockHotelRepo.findByIds.mockResolvedValue([mockHotel]);
            mockUserRepo.save.mockImplementation(async (u) => u);

            const result = await service.update(1, { hotelIds: [1] });
            expect(result.hotels).toEqual([mockHotel]);
        });
    });

    describe('updateCurrentProfile', () => {
        it('should update only safe profile fields and sanitize the result', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, password: 'secret', invitationToken: 'invite-token', resetPasswordToken: 'reset-token' });
            mockUserRepo.save.mockImplementation(async (u) => u);

            const result = await service.updateCurrentProfile(1, { firstName: ' Updated ', lastName: ' Name ' });

            expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 }, relations: ['hotels', 'tenant'] });
            expect(mockUserRepo.save).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Updated', lastName: 'Name' }));
            expect(result).not.toHaveProperty('password');
            expect(result).not.toHaveProperty('invitationToken');
            expect(result).not.toHaveProperty('resetPasswordToken');
        });

        it('should reject profile updates for missing users', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);

            await expect(service.updateCurrentProfile(99, { firstName: 'Nope' })).rejects.toThrow(NotFoundException);
        });
    });

    describe('changeCurrentPassword', () => {
        it('should require the current password and store a hashed new password', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, password: 'old-hash' });
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
            mockUserRepo.save.mockImplementation(async (u) => u);

            const result = await service.changeCurrentPassword(1, { currentPassword: 'old-password', newPassword: 'new-password' });

            expect(bcrypt.compare).toHaveBeenCalledWith('old-password', 'old-hash');
            expect(mockUserRepo.save).toHaveBeenCalledWith(expect.objectContaining({ password: 'new-hash' }));
            expect(mockAuditService.logAuth).toHaveBeenCalledWith(expect.objectContaining({
                eventType: 'PASSWORD_CHANGED',
                actorEmail: mockUser.email,
            }));
            expect(result).toEqual({ message: 'Password changed successfully.' });
        });

        it('should reject an invalid current password', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, password: 'old-hash' });
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            await expect(service.changeCurrentPassword(1, { currentPassword: 'wrong', newPassword: 'new-password' })).rejects.toThrow(UnauthorizedException);
        });
    });

    describe('findAssignedHotels', () => {
        it('should return assigned hotels', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, hotels: [mockHotel] });
            const result = await service.findAssignedHotels(1);
            expect(mockUserRepo.findOne).toHaveBeenCalledWith({
                where: { id: 1 },
                relations: ['hotels', 'hotels.bankAccounts'],
            });
            expect(result).toEqual([mockHotel]);
        });

        it('should return empty array if user has no hotels or not found', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);
            const result = await service.findAssignedHotels(1);
            expect(result).toEqual([]);
        });
    });

    describe('remove', () => {
        it('should suspend a user without hiding the row', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, isActive: true, invitationToken: 'token' });
            mockUserRepo.save.mockImplementation(async (u) => u);

            const result = await service.remove(1);

            expect(result.isActive).toBe(false);
            expect(result.accountStatus).toBe('SUSPENDED');
            expect(result).not.toHaveProperty('password');
            expect(result).not.toHaveProperty('invitationToken');
            expect(mockUserRepo.softDelete).not.toHaveBeenCalled();
        });
    });

    describe('suspend', () => {
        it('should mark a user as inactive and suspended', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, isActive: true });
            mockUserRepo.save.mockImplementation(async (u) => u);

            const result = await service.suspend(1);

            expect(result.isActive).toBe(false);
            expect(result.accountStatus).toBe('SUSPENDED');
        });

        it('should reject attempts to suspend the current user', async () => {
            await expect(service.suspend(1, {
                id: 1,
                email: 'admin@test.com',
                role: UserRole.ADMIN,
                hotelIds: [],
                tenantId: 1,
            })).rejects.toThrow(ForbiddenException);
            expect(mockUserRepo.findOne).not.toHaveBeenCalled();
            expect(mockUserRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('reactivate', () => {
        it('should reactivate a suspended user', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, isActive: false, password: 'password' });
            mockUserRepo.save.mockImplementation(async (u) => u);

            const result = await service.reactivate(1);

            expect(result.isActive).toBe(true);
            expect(result.accountStatus).toBe('ACTIVE');
        });

        it('should recover a previously soft-deleted user before reactivation', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, isActive: false, password: 'password', deletedAt: new Date() });
            mockUserRepo.recover.mockImplementation(async (u) => u);
            mockUserRepo.save.mockImplementation(async (u) => u);

            const result = await service.reactivate(1);

            expect(mockUserRepo.recover).toHaveBeenCalled();
            expect(result.accountStatus).toBe('ACTIVE');
        });

        it('should reject reactivation for users who never accepted an invite', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, isActive: false, password: null });

            await expect(service.reactivate(1)).rejects.toThrow(BadRequestException);
        });
    });
});
