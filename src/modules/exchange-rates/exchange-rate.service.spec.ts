import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { Hotel } from '../hotel/entities/hotel.entity';

describe('ExchangeRateService', () => {
    let service: ExchangeRateService;

    const mockExchangeRateRepo = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        findOneBy: jest.fn(),
        remove: jest.fn(),
    };

    const mockHotelRepo = {
        findOneBy: jest.fn(),
    };

    const mockHotelId = 1;
    const mockId = 100;
    const mockRate = {
        id: mockId,
        fromCurrency: 'EUR',
        toCurrency: 'TND',
        rate: 3.1,
        hotelId: mockHotelId,
        effectiveDate: new Date('2026-01-01'),
        source: 'manual',
        updatedBy: 'admin@example.com',
    } as ExchangeRate;

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
        mockExchangeRateRepo.findOne.mockResolvedValue(null);
    });

    describe('create', () => {
        it('creates an explicit currency pair', async () => {
            mockHotelRepo.findOneBy.mockResolvedValue({ id: mockHotelId });
            mockExchangeRateRepo.create.mockReturnValue(mockRate);
            mockExchangeRateRepo.save.mockResolvedValue(mockRate);

            const result = await service.create(mockHotelId, {
                fromCurrency: 'eur',
                toCurrency: 'tnd',
                rate: 3.1,
                effectiveDate: '2026-01-01',
                source: 'manual' as any,
            }, 'admin@example.com');

            expect(mockExchangeRateRepo.create).toHaveBeenCalledWith(expect.objectContaining({
                fromCurrency: 'EUR',
                toCurrency: 'TND',
                updatedBy: 'admin@example.com',
            }));
            expect(result).toEqual(mockRate);
        });

        it('throws NotFoundException if hotel not found', async () => {
            mockHotelRepo.findOneBy.mockResolvedValue(null);

            await expect(service.create(mockHotelId, {
                fromCurrency: 'EUR',
                toCurrency: 'TND',
                rate: 3.1,
                effectiveDate: '2026-01-01',
            })).rejects.toThrow(NotFoundException);
        });

        it('rejects duplicate pairs for the same effective date', async () => {
            mockHotelRepo.findOneBy.mockResolvedValue({ id: mockHotelId });
            mockExchangeRateRepo.findOne.mockResolvedValue(mockRate);

            await expect(service.create(mockHotelId, {
                fromCurrency: 'EUR',
                toCurrency: 'TND',
                rate: 3.1,
                effectiveDate: '2026-01-01',
            })).rejects.toThrow(BadRequestException);
        });
    });

    describe('findAll', () => {
        it('returns all exchange rates for a hotel', async () => {
            mockExchangeRateRepo.find.mockResolvedValue([mockRate]);
            const result = await service.findAll(mockHotelId);
            expect(result).toEqual([mockRate]);
        });
    });

    describe('findOne', () => {
        it('returns a single exchange rate', async () => {
            mockExchangeRateRepo.findOneBy.mockResolvedValue(mockRate);
            const result = await service.findOne(mockHotelId, mockId);
            expect(result).toEqual(mockRate);
        });

        it('throws NotFoundException if not found', async () => {
            mockExchangeRateRepo.findOneBy.mockResolvedValue(null);
            await expect(service.findOne(mockHotelId, mockId)).rejects.toThrow(NotFoundException);
        });
    });

    describe('update', () => {
        it('updates an exchange rate', async () => {
            mockExchangeRateRepo.findOneBy.mockResolvedValue({ ...mockRate });
            mockExchangeRateRepo.save.mockResolvedValue({ ...mockRate, rate: 3.2 });

            const result = await service.update(mockHotelId, mockId, {
                rate: 3.2,
                effectiveDate: '2026-02-01',
                source: 'imported' as any,
            }, 'commercial@example.com');

            expect(result.rate).toEqual(3.2);
            expect(mockExchangeRateRepo.save).toHaveBeenCalledWith(expect.objectContaining({
                effectiveDate: new Date('2026-02-01'),
                source: 'imported',
                updatedBy: 'commercial@example.com',
            }));
        });

        it('throws NotFoundException if rate not found', async () => {
            mockExchangeRateRepo.findOneBy.mockResolvedValue(null);
            await expect(service.update(mockHotelId, mockId, { rate: 3.2 })).rejects.toThrow(NotFoundException);
        });
    });

    describe('remove', () => {
        it('removes an exchange rate', async () => {
            mockExchangeRateRepo.findOneBy.mockResolvedValue(mockRate);
            mockExchangeRateRepo.remove.mockResolvedValue(mockRate);

            await service.remove(mockHotelId, mockId);
            expect(mockExchangeRateRepo.remove).toHaveBeenCalledWith(mockRate);
        });

        it('throws NotFoundException if not found', async () => {
            mockExchangeRateRepo.findOneBy.mockResolvedValue(null);
            await expect(service.remove(mockHotelId, mockId)).rejects.toThrow(NotFoundException);
        });
    });
});
