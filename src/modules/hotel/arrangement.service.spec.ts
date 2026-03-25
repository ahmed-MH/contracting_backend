import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ArrangementService } from './arrangement.service';
import { Arrangement } from './entities/arrangement.entity';
import { Hotel } from './entities/hotel.entity';
import { NotFoundException } from '@nestjs/common';

describe('ArrangementService', () => {
    let service: ArrangementService;

    const mockArrangementRepo = {
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
    const mockArrangement = { id: mockId, name: 'All Inclusive', hotel: { id: mockHotelId } } as any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ArrangementService,
                { provide: getRepositoryToken(Arrangement), useValue: mockArrangementRepo },
                { provide: getRepositoryToken(Hotel), useValue: mockHotelRepo },
            ],
        }).compile();

        service = module.get<ArrangementService>(ArrangementService);
        jest.clearAllMocks();
    });

    describe('createArrangement', () => {
        it('should create an arrangement', async () => {
            mockHotelRepo.findOne.mockResolvedValue({ id: mockHotelId });
            mockArrangementRepo.create.mockReturnValue(mockArrangement);
            mockArrangementRepo.save.mockResolvedValue(mockArrangement);

            const result = await service.createArrangement(mockHotelId, { name: 'All Inclusive' });
            expect(result).toEqual(mockArrangement);
            expect(mockHotelRepo.findOne).toHaveBeenCalledWith({ where: { id: mockHotelId } });
        });

        it('should throw NotFoundException if hotel not found', async () => {
            mockHotelRepo.findOne.mockResolvedValue(null);
            await expect(service.createArrangement(mockHotelId, { name: 'All Inclusive' })).rejects.toThrow(NotFoundException);
        });
    });

    describe('findAllArrangements', () => {
        it('should return all arrangements', async () => {
            mockArrangementRepo.find.mockResolvedValue([mockArrangement]);
            const result = await service.findAllArrangements(mockHotelId);
            expect(result).toEqual([mockArrangement]);
            expect(mockArrangementRepo.find).toHaveBeenCalledWith({ where: { hotelId: mockHotelId } });
        });
    });

    describe('findArchivedArrangements', () => {
        it('should return archived arrangements', async () => {
            mockArrangementRepo.find.mockResolvedValue([mockArrangement]);
            const result = await service.findArchivedArrangements(mockHotelId);
            expect(result).toEqual([mockArrangement]);
        });
    });

    describe('updateArrangement', () => {
        it('should update an arrangement', async () => {
            mockArrangementRepo.findOne.mockResolvedValue(mockArrangement);
            mockArrangementRepo.save.mockResolvedValue({ ...mockArrangement, name: 'Half Board' });

            const result = await service.updateArrangement(mockHotelId, mockId, { name: 'Half Board' });
            expect(result.name).toEqual('Half Board');
            expect(mockArrangementRepo.findOne).toHaveBeenCalledWith({ where: { id: mockId, hotelId: mockHotelId } });
        });

        it('should throw NotFoundException if arrangement not found', async () => {
            mockArrangementRepo.findOne.mockResolvedValue(null);
            await expect(service.updateArrangement(mockHotelId, mockId, { name: 'Half Board' })).rejects.toThrow(NotFoundException);
        });
    });

    describe('removeArrangement', () => {
        it('should remove an arrangement', async () => {
            mockArrangementRepo.findOne.mockResolvedValue(mockArrangement);
            mockArrangementRepo.softDelete.mockResolvedValue({ affected: 1 });

            await service.removeArrangement(mockHotelId, mockId);
            expect(mockArrangementRepo.softDelete).toHaveBeenCalledWith(mockId);
        });

        it('should throw NotFoundException if arrangement not found', async () => {
            mockArrangementRepo.findOne.mockResolvedValue(null);
            await expect(service.removeArrangement(mockHotelId, mockId)).rejects.toThrow(NotFoundException);
        });
    });

    describe('restoreArrangement', () => {
        it('should restore an arrangement', async () => {
            mockArrangementRepo.findOne.mockResolvedValue(mockArrangement);
            mockArrangementRepo.restore.mockResolvedValue({ affected: 1 });

            await service.restoreArrangement(mockHotelId, mockId);
            expect(mockArrangementRepo.restore).toHaveBeenCalledWith(mockId);
            expect(mockArrangementRepo.findOne).toHaveBeenCalledWith({ where: { id: mockId, hotelId: mockHotelId }, withDeleted: true });
        });

        it('should throw NotFoundException if arrangement not found', async () => {
            mockArrangementRepo.findOne.mockResolvedValue(null);
            await expect(service.restoreArrangement(mockHotelId, mockId)).rejects.toThrow(NotFoundException);
        });
    });
});
