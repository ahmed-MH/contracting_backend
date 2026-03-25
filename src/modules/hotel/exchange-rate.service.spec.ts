import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { Hotel } from './entities/hotel.entity';
import { NotFoundException } from '@nestjs/common';

describe('ExchangeRateService', () => {
    let service: ExchangeRateService;

    const mockExchangeRateRepo = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOneBy: jest.fn(),
        remove: jest.fn(),
    };

    const mockHotelRepo = {
        findOneBy: jest.fn(),
    };

    const mockHotelId = 1;
    const mockId = 100;
    const mockRate = { id: mockId, currency: 'USD', rate: 1.1, hotelId: mockHotelId, validFrom: new Date(), validUntil: null } as any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ExchangeRateService,
                { provide: getRepositoryToken(ExchangeRate), useValue: mockExchangeRateRepo },
                { provide: getRepositoryToken(Hotel), useValue: mockHotelRepo },
            ],
        }).compile();

        service = module.get<ExchangeRateService>(ExchangeRateService);
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('should create an exchange rate', async () => {
            mockHotelRepo.findOneBy.mockResolvedValue({ id: mockHotelId });
            mockExchangeRateRepo.create.mockReturnValue(mockRate);
            mockExchangeRateRepo.save.mockResolvedValue(mockRate);

            const result = await service.create(mockHotelId, { currency: 'USD', rate: 1.1, validFrom: new Date().toISOString() });
            expect(result).toEqual(mockRate);
        });
        
        it('should create an exchange rate with validUntil', async () => {
            mockHotelRepo.findOneBy.mockResolvedValue({ id: mockHotelId });
            mockExchangeRateRepo.create.mockReturnValue(mockRate);
            mockExchangeRateRepo.save.mockResolvedValue(mockRate);

            const result = await service.create(mockHotelId, { currency: 'USD', rate: 1.1, validFrom: new Date().toISOString(), validUntil: new Date().toISOString() });
            expect(result).toEqual(mockRate);
        });

        it('should throw NotFoundException if hotel not found', async () => {
            mockHotelRepo.findOneBy.mockResolvedValue(null);
            await expect(service.create(mockHotelId, { currency: 'USD', rate: 1.1, validFrom: new Date().toISOString() })).rejects.toThrow(NotFoundException);
        });
    });

    describe('findAll', () => {
        it('should return all exchange rates for a hotel', async () => {
            mockExchangeRateRepo.find.mockResolvedValue([mockRate]);
            const result = await service.findAll(mockHotelId);
            expect(result).toEqual([mockRate]);
        });
    });

    describe('findOne', () => {
        it('should return a single exchange rate', async () => {
            mockExchangeRateRepo.findOneBy.mockResolvedValue(mockRate);
            const result = await service.findOne(mockHotelId, mockId);
            expect(result).toEqual(mockRate);
        });

        it('should throw NotFoundException if not found', async () => {
            mockExchangeRateRepo.findOneBy.mockResolvedValue(null);
            await expect(service.findOne(mockHotelId, mockId)).rejects.toThrow(NotFoundException);
        });
    });

    describe('update', () => {
        it('should update an exchange rate including validUntil and validFrom', async () => {
            mockExchangeRateRepo.findOneBy.mockResolvedValue(mockRate);
            mockExchangeRateRepo.save.mockResolvedValue({ ...mockRate, rate: 1.2 });

            const result = await service.update(mockHotelId, mockId, { rate: 1.2, validFrom: new Date().toISOString(), validUntil: new Date().toISOString(), currency: 'EUR' });
            expect(result.rate).toEqual(1.2);
        });

        it('should update an exchange rate setting validUntil to null', async () => {
            mockExchangeRateRepo.findOneBy.mockResolvedValue(mockRate);
            mockExchangeRateRepo.save.mockResolvedValue({ ...mockRate, validUntil: null });

            const result = await service.update(mockHotelId, mockId, { validUntil: null });
            expect(result.validUntil).toBeNull();
        });

        it('should throw NotFoundException if rate not found', async () => {
            mockExchangeRateRepo.findOneBy.mockResolvedValue(null);
            await expect(service.update(mockHotelId, mockId, { rate: 1.2 })).rejects.toThrow(NotFoundException);
        });
    });

    describe('remove', () => {
        it('should remove an exchange rate', async () => {
            mockExchangeRateRepo.findOneBy.mockResolvedValue(mockRate);
            mockExchangeRateRepo.remove.mockResolvedValue(mockRate);

            await service.remove(mockHotelId, mockId);
            expect(mockExchangeRateRepo.remove).toHaveBeenCalledWith(mockRate);
        });

        it('should throw NotFoundException if not found', async () => {
            mockExchangeRateRepo.findOneBy.mockResolvedValue(null);
            await expect(service.remove(mockHotelId, mockId)).rejects.toThrow(NotFoundException);
        });
    });
});
