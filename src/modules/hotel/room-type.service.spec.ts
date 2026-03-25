import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RoomTypeService } from './room-type.service';
import { RoomType } from './entities/room-type.entity';
import { Hotel } from './entities/hotel.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('RoomTypeService', () => {
    let service: RoomTypeService;

    const mockRoomTypeRepo = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        softDelete: jest.fn(),
        restore: jest.fn(),
    };

    const mockHotelRepo = {
        findOne: jest.fn(),
    };

    const mockHotelId = 1;
    const mockId = 100;
    const mockRoom = { id: mockId, name: 'Standard Room', minOccupancy: 1, maxOccupancy: 2, minAdults: 1, maxAdults: 2, minChildren: 0, maxChildren: 1, hotel: { id: mockHotelId } } as any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RoomTypeService,
                { provide: getRepositoryToken(RoomType), useValue: mockRoomTypeRepo },
                { provide: getRepositoryToken(Hotel), useValue: mockHotelRepo },
            ],
        }).compile();

        service = module.get<RoomTypeService>(RoomTypeService);
        jest.clearAllMocks();
    });

    describe('createRoomType', () => {
        it('should create a room type', async () => {
            mockHotelRepo.findOne.mockResolvedValue({ id: mockHotelId });
            mockRoomTypeRepo.create.mockReturnValue(mockRoom);
            mockRoomTypeRepo.save.mockResolvedValue(mockRoom);

            const result = await service.createRoomType(mockHotelId, { name: 'Standard Room', minOccupancy: 1, maxOccupancy: 2 } as any);
            expect(result).toEqual(mockRoom);
        });

        it('should throw BadRequestException if minOccupancy > maxOccupancy', async () => {
            await expect(service.createRoomType(mockHotelId, { minOccupancy: 3, maxOccupancy: 2 } as any)).rejects.toThrow(BadRequestException);
        });

        it('should throw BadRequestException if minAdults > maxAdults', async () => {
            await expect(service.createRoomType(mockHotelId, { minAdults: 3, maxAdults: 2 } as any)).rejects.toThrow(BadRequestException);
        });

        it('should throw BadRequestException if minChildren > maxChildren', async () => {
            await expect(service.createRoomType(mockHotelId, { minChildren: 3, maxChildren: 2 } as any)).rejects.toThrow(BadRequestException);
        });

        it('should throw NotFoundException if hotel not found', async () => {
            mockHotelRepo.findOne.mockResolvedValue(null);
            await expect(service.createRoomType(mockHotelId, { name: 'Standard Room' } as any)).rejects.toThrow(NotFoundException);
        });
    });

    describe('findAllRoomTypes', () => {
        it('should return all room types', async () => {
            mockRoomTypeRepo.find.mockResolvedValue([mockRoom]);
            const result = await service.findAllRoomTypes(mockHotelId);
            expect(result).toEqual([mockRoom]);
        });
    });

    describe('findArchivedRoomTypes', () => {
        it('should return archived room types', async () => {
            mockRoomTypeRepo.find.mockResolvedValue([mockRoom]);
            const result = await service.findArchivedRoomTypes(mockHotelId);
            expect(result).toEqual([mockRoom]);
        });
    });

    describe('updateRoomType', () => {
        it('should update a room type', async () => {
            const currentRoom = { ...mockRoom };
            mockRoomTypeRepo.findOne.mockResolvedValue(currentRoom);
            mockRoomTypeRepo.save.mockResolvedValue({ ...currentRoom, name: 'Deluxe Room' });

            const result = await service.updateRoomType(mockHotelId, mockId, { name: 'Deluxe Room' });
            expect(result.name).toEqual('Deluxe Room');
        });

        it('should throw NotFoundException if room type not found', async () => {
            mockRoomTypeRepo.findOne.mockResolvedValue(null);
            await expect(service.updateRoomType(mockHotelId, mockId, { name: 'Deluxe Room' })).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException if valid ranges are violated after merge', async () => {
            const currentRoom = { ...mockRoom };
            mockRoomTypeRepo.findOne.mockResolvedValue(currentRoom);
            await expect(service.updateRoomType(mockHotelId, mockId, { minOccupancy: 5 })).rejects.toThrow(BadRequestException);
        });

        it('should throw BadRequestException if adults range violated after merge', async () => {
            const currentRoom = { ...mockRoom };
            mockRoomTypeRepo.findOne.mockResolvedValue(currentRoom);
            await expect(service.updateRoomType(mockHotelId, mockId, { minAdults: 5 })).rejects.toThrow(BadRequestException);
        });

        it('should throw BadRequestException if children range violated after merge', async () => {
            const currentRoom = { ...mockRoom };
            mockRoomTypeRepo.findOne.mockResolvedValue(currentRoom);
            await expect(service.updateRoomType(mockHotelId, mockId, { minChildren: 5 })).rejects.toThrow(BadRequestException);
        });
    });

    describe('removeRoomType', () => {
        it('should remove a room type', async () => {
            mockRoomTypeRepo.findOne.mockResolvedValue(mockRoom);
            mockRoomTypeRepo.softDelete.mockResolvedValue({ affected: 1 });

            await service.removeRoomType(mockHotelId, mockId);
            expect(mockRoomTypeRepo.softDelete).toHaveBeenCalledWith(mockId);
        });

        it('should throw NotFoundException if not found', async () => {
            mockRoomTypeRepo.findOne.mockResolvedValue(null);
            await expect(service.removeRoomType(mockHotelId, mockId)).rejects.toThrow(NotFoundException);
        });
    });

    describe('restoreRoomType', () => {
        it('should restore a room type', async () => {
            mockRoomTypeRepo.findOne.mockResolvedValue(mockRoom);
            mockRoomTypeRepo.restore.mockResolvedValue({ affected: 1 });

            await service.restoreRoomType(mockHotelId, mockId);
            expect(mockRoomTypeRepo.restore).toHaveBeenCalledWith(mockId);
        });

        it('should throw NotFoundException if not found', async () => {
            mockRoomTypeRepo.findOne.mockResolvedValue(null);
            await expect(service.restoreRoomType(mockHotelId, mockId)).rejects.toThrow(NotFoundException);
        });
    });
});
