import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AffiliateService } from './affiliate.service';
import { Affiliate } from './entities/affiliate.entity';
import { NotFoundException } from '@nestjs/common';

describe('AffiliateService', () => {
    let service: AffiliateService;

    const mockAffiliateRepo = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        preload: jest.fn(),
        softDelete: jest.fn(),
        restore: jest.fn(),
    };

    const mockHotelId = 1;
    const mockId = 100;
    const mockAffiliate = { id: mockId, name: 'TUI', hotelId: mockHotelId, contracts: [] } as any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AffiliateService,
                { provide: getRepositoryToken(Affiliate), useValue: mockAffiliateRepo },
            ],
        }).compile();

        service = module.get<AffiliateService>(AffiliateService);
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('should create an affiliate', async () => {
            mockAffiliateRepo.create.mockReturnValue(mockAffiliate);
            mockAffiliateRepo.save.mockResolvedValue(mockAffiliate);

            const result = await service.create(mockHotelId, { name: 'TUI', email: 'test@tui.com', phone: '123', address: 'London' });
            expect(result).toEqual(mockAffiliate);
        });
    });

    describe('findAll', () => {
        it('should return all affiliates for a hotel', async () => {
            mockAffiliateRepo.find.mockResolvedValue([mockAffiliate]);
            const result = await service.findAll(mockHotelId);
            expect(result).toEqual([mockAffiliate]);
        });
    });

    describe('findArchived', () => {
        it('should return archived affiliates', async () => {
            mockAffiliateRepo.find.mockResolvedValue([mockAffiliate]);
            const result = await service.findArchived(mockHotelId);
            expect(result).toEqual([mockAffiliate]);
        });
    });

    describe('getContractsForAffiliate', () => {
        it('should return contracts for an affiliate', async () => {
            mockAffiliateRepo.findOne.mockResolvedValue(mockAffiliate);
            const result = await service.getContractsForAffiliate(mockHotelId, mockId);
            expect(result).toEqual([]);
        });

        it('should throw NotFoundException if affiliate not found', async () => {
            mockAffiliateRepo.findOne.mockResolvedValue(null);
            await expect(service.getContractsForAffiliate(mockHotelId, mockId)).rejects.toThrow(NotFoundException);
        });

        it('should return empty array if contracts are undefined', async () => {
            mockAffiliateRepo.findOne.mockResolvedValue({ id: mockId, hotelId: mockHotelId });
            const result = await service.getContractsForAffiliate(mockHotelId, mockId);
            expect(result).toEqual([]);
        });
    });

    describe('update', () => {
        it('should update an affiliate', async () => {
            mockAffiliateRepo.preload.mockResolvedValue(mockAffiliate);
            mockAffiliateRepo.save.mockResolvedValue({ ...mockAffiliate, name: 'Updated' });

            const result = await service.update(mockHotelId, mockId, { name: 'Updated' });
            expect(result.name).toEqual('Updated');
        });

        it('should throw NotFoundException if affiliate not found or hotel mismatch', async () => {
            mockAffiliateRepo.preload.mockResolvedValue(null);
            await expect(service.update(mockHotelId, mockId, { name: 'Updated' })).rejects.toThrow(NotFoundException);

            mockAffiliateRepo.preload.mockResolvedValue({ id: mockId, hotelId: 999 });
            await expect(service.update(mockHotelId, mockId, { name: 'Updated' })).rejects.toThrow(NotFoundException);
        });
    });

    describe('remove', () => {
        it('should remove an affiliate', async () => {
            mockAffiliateRepo.findOne.mockResolvedValue(mockAffiliate);
            mockAffiliateRepo.softDelete.mockResolvedValue({ affected: 1 });

            await service.remove(mockHotelId, mockId);
            expect(mockAffiliateRepo.softDelete).toHaveBeenCalledWith(mockId);
        });

        it('should throw NotFoundException if affiliate not found', async () => {
            mockAffiliateRepo.findOne.mockResolvedValue(null);
            await expect(service.remove(mockHotelId, mockId)).rejects.toThrow(NotFoundException);
        });

        it('should throw NotFoundException if delete operation affects 0 rows', async () => {
            mockAffiliateRepo.findOne.mockResolvedValue(mockAffiliate);
            mockAffiliateRepo.softDelete.mockResolvedValue({ affected: 0 });
            await expect(service.remove(mockHotelId, mockId)).rejects.toThrow(NotFoundException);
        });
    });

    describe('restore', () => {
        it('should restore an affiliate', async () => {
            mockAffiliateRepo.findOne.mockResolvedValue(mockAffiliate);
            mockAffiliateRepo.restore.mockResolvedValue({ affected: 1 });

            await service.restore(mockHotelId, mockId);
            expect(mockAffiliateRepo.restore).toHaveBeenCalledWith(mockId);
        });

        it('should throw NotFoundException if affiliate not found', async () => {
            mockAffiliateRepo.findOne.mockResolvedValue(null);
            await expect(service.restore(mockHotelId, mockId)).rejects.toThrow(NotFoundException);
        });

        it('should throw NotFoundException if restore operation affects 0 rows', async () => {
            mockAffiliateRepo.findOne.mockResolvedValue(mockAffiliate);
            mockAffiliateRepo.restore.mockResolvedValue({ affected: 0 });
            await expect(service.restore(mockHotelId, mockId)).rejects.toThrow(NotFoundException);
        });
    });
});
