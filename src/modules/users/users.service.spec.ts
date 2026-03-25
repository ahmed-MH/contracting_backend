import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Hotel } from '../hotel/entities/hotel.entity';
import { UserRole } from '../../common/constants/enums';
import { ConflictException, BadRequestException } from '@nestjs/common';

describe('UsersService', () => {
    let service: UsersService;

    const mockUserRepo = {
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        softDelete: jest.fn(),
    };

    const mockHotelRepo = {
        findByIds: jest.fn(),
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
            expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 }, relations: ['hotels'] });
        });
    });

    describe('findByInvitationToken', () => {
        it('should return a user by invitation token', async () => {
            mockUserRepo.findOne.mockResolvedValue(mockUser);
            const result = await service.findByInvitationToken('token');
            expect(result).toEqual(mockUser);
            expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { invitationToken: 'token' } });
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
            const result = await service.findAll();
            expect(result[0]).not.toHaveProperty('password');
            expect(result[0].email).toEqual('test@test.com');
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

    describe('findAssignedHotels', () => {
        it('should return assigned hotels', async () => {
            mockUserRepo.findOne.mockResolvedValue({ ...mockUser, hotels: [mockHotel] });
            const result = await service.findAssignedHotels(1);
            expect(result).toEqual([mockHotel]);
        });

        it('should return empty array if user has no hotels or not found', async () => {
            mockUserRepo.findOne.mockResolvedValue(null);
            const result = await service.findAssignedHotels(1);
            expect(result).toEqual([]);
        });
    });

    describe('remove', () => {
        it('should soft delete a user', async () => {
            mockUserRepo.softDelete.mockResolvedValue({ affected: 1 });
            await service.remove(1);
            expect(mockUserRepo.softDelete).toHaveBeenCalledWith(1);
        });
    });
});
