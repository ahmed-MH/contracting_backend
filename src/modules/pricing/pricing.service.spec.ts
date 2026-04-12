import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PricingService } from './pricing.service';
import { ContractLine } from '../contract/core/entities/contract-line.entity';
import { Price } from '../contract/core/entities/price.entity';
import { Promotion } from '../contract/core/entities/promotion.entity';
import { Period } from '../contract/core/entities/period.entity';
import { ContractRoom } from '../contract/core/entities/contract-room.entity';
import { Arrangement } from '../hotel/entities/arrangement.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { In } from 'typeorm';

describe('PricingService', () => {
    let service: PricingService;

    const mockLineRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
    };
    const mockPriceRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
    };
    const mockPromotionRepo = {
        find: jest.fn(),
    };
    const mockPeriodRepo = {
        findOne: jest.fn(),
    };
    const mockContractRoomRepo = {
        findOne: jest.fn(),
    };
    const mockArrangementRepo = {
        findOne: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PricingService,
                { provide: getRepositoryToken(ContractLine), useValue: mockLineRepo },
                { provide: getRepositoryToken(Price), useValue: mockPriceRepo },
                { provide: getRepositoryToken(Promotion), useValue: mockPromotionRepo },
                { provide: getRepositoryToken(Period), useValue: mockPeriodRepo },
                { provide: getRepositoryToken(ContractRoom), useValue: mockContractRoomRepo },
                { provide: getRepositoryToken(Arrangement), useValue: mockArrangementRepo },
            ],
        }).compile();

        service = module.get<PricingService>(PricingService);
        jest.clearAllMocks();
    });

    describe('initContractLine', () => {
        const dto = { contractId: 1, periodId: 1, contractRoomId: 1 };
        const mockPeriod = { id: 1, contract: { id: 1 } };
        const mockContractRoom = { id: 1, contract: { id: 1 } };

        it('should return existing line if already created', async () => {
            const existingLine = { id: 100 };
            mockLineRepo.findOne.mockResolvedValue(existingLine);

            const result = await service.initContractLine(1, dto);
            expect(result).toEqual(existingLine);
            expect(mockLineRepo.findOne).toHaveBeenCalledWith({
                where: { period: { id: dto.periodId }, contractRoom: { id: dto.contractRoomId } },
                relations: ['period', 'contractRoom'],
            });
        });

        it('should create and return a new line', async () => {
            mockLineRepo.findOne.mockResolvedValue(null);
            mockPeriodRepo.findOne.mockResolvedValue(mockPeriod);
            mockContractRoomRepo.findOne.mockResolvedValue(mockContractRoom);
            const newLine = { id: 101, period: mockPeriod, contractRoom: mockContractRoom };
            mockLineRepo.create.mockReturnValue(newLine);
            mockLineRepo.save.mockResolvedValue(newLine);

            const result = await service.initContractLine(1, dto);
            expect(result).toEqual(newLine);
            expect(mockLineRepo.save).toHaveBeenCalledWith(newLine);
        });

        it('should throw NotFoundException if period not found', async () => {
            mockLineRepo.findOne.mockResolvedValue(null);
            mockPeriodRepo.findOne.mockResolvedValue(null);
            await expect(service.initContractLine(1, dto)).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException if period belongs to different contract', async () => {
            mockLineRepo.findOne.mockResolvedValue(null);
            mockPeriodRepo.findOne.mockResolvedValue({ id: 1, contract: { id: 2 } });
            await expect(service.initContractLine(1, dto)).rejects.toThrow(BadRequestException);
        });

        it('should throw NotFoundException if contractRoom not found', async () => {
            mockLineRepo.findOne.mockResolvedValue(null);
            mockPeriodRepo.findOne.mockResolvedValue(mockPeriod);
            mockContractRoomRepo.findOne.mockResolvedValue(null);
            await expect(service.initContractLine(1, dto)).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException if contractRoom belongs to different contract', async () => {
            mockLineRepo.findOne.mockResolvedValue(null);
            mockPeriodRepo.findOne.mockResolvedValue(mockPeriod);
            mockContractRoomRepo.findOne.mockResolvedValue({ id: 1, contract: { id: 2 } });
            await expect(service.initContractLine(1, dto)).rejects.toThrow(BadRequestException);
        });
    });

    describe('setPrice', () => {
        const dto = { contractLineId: 1, arrangementId: 1, amount: 150 };
        const mockLine = { id: 1 };
        const mockArrangement = { id: 1 };

        it('should update existing price', async () => {
            mockLineRepo.findOne.mockResolvedValue(mockLine);
            mockArrangementRepo.findOne.mockResolvedValue(mockArrangement);
            
            const existingPrice = { id: 1, amount: 100 };
            mockPriceRepo.findOne.mockResolvedValue(existingPrice);
            mockPriceRepo.save.mockResolvedValue({ ...existingPrice, amount: 150 });

            const result = await service.setPrice(1, dto);
            expect(result.amount).toBe(150);
            expect(mockPriceRepo.save).toHaveBeenCalledWith(expect.objectContaining({ amount: 150 }));
        });

        it('should create new price if not exists', async () => {
            mockLineRepo.findOne.mockResolvedValue(mockLine);
            mockArrangementRepo.findOne.mockResolvedValue(mockArrangement);
            mockPriceRepo.findOne.mockResolvedValue(null);
            
            const newPrice = { contractLine: mockLine, arrangement: mockArrangement, amount: 150, currency: 'TND', minStay: 1, releaseDays: 0 };
            mockPriceRepo.create.mockReturnValue(newPrice);
            mockPriceRepo.save.mockResolvedValue(newPrice);

            const result = await service.setPrice(1, dto);
            expect(result).toEqual(newPrice);
            expect(mockPriceRepo.create).toHaveBeenCalled();
        });

        it('should throw NotFoundException if line not found', async () => {
            mockLineRepo.findOne.mockResolvedValue(null);
            await expect(service.setPrice(1, dto)).rejects.toThrow(NotFoundException);
        });

        it('should throw NotFoundException if arrangement not found', async () => {
            mockLineRepo.findOne.mockResolvedValue(mockLine);
            mockArrangementRepo.findOne.mockResolvedValue(null);
            await expect(service.setPrice(1, dto)).rejects.toThrow(NotFoundException);
        });
    });

    describe('setLinePromotions', () => {
        const dto = { contractLineId: 1, promotionIds: [1, 2] };

        it('should replace promotions on a line', async () => {
            const mockLine = { id: 1, promotions: [] };
            const mockPromos = [{ id: 1 }, { id: 2 }];
            
            mockLineRepo.findOne.mockResolvedValue(mockLine);
            mockPromotionRepo.find.mockResolvedValue(mockPromos);
            mockLineRepo.save.mockResolvedValue({ ...mockLine, promotions: mockPromos });

            const result = await service.setLinePromotions(1, dto);
            expect(result.promotions).toEqual(mockPromos);
            expect(mockLineRepo.save).toHaveBeenCalledWith({ ...mockLine, promotions: mockPromos });
        });

        it('should throw NotFoundException if line not found', async () => {
            mockLineRepo.findOne.mockResolvedValue(null);
            await expect(service.setLinePromotions(1, dto)).rejects.toThrow(NotFoundException);
        });

        it('should throw NotFoundException if not all promotions found', async () => {
            const mockLine = { id: 1, promotions: [] };
            mockLineRepo.findOne.mockResolvedValue(mockLine);
            mockPromotionRepo.find.mockResolvedValue([{ id: 1 }]); // missing 2

            await expect(service.setLinePromotions(1, dto)).rejects.toThrow(NotFoundException);
        });
    });

    describe('setAllotment', () => {
        it('should update line allotment', async () => {
            const mockLine = { id: 1, allotment: 0 };
            mockLineRepo.findOne.mockResolvedValue(mockLine);
            mockLineRepo.save.mockResolvedValue({ ...mockLine, allotment: 10 });

            const result = await service.setAllotment(1, { contractLineId: 1, quantity: 10 });
            expect(result.allotment).toBe(10);
            expect(mockLineRepo.save).toHaveBeenCalledWith({ ...mockLine, allotment: 10 });
        });

        it('should throw NotFoundException if line not found', async () => {
            mockLineRepo.findOne.mockResolvedValue(null);
            await expect(service.setAllotment(1, { contractLineId: 1, quantity: 10 })).rejects.toThrow(NotFoundException);
        });
    });

    describe('getMatrix', () => {
        it('should return full pricing matrix', async () => {
            const mockLines = [{ id: 1 }];
            mockLineRepo.find.mockResolvedValue(mockLines);

            const result = await service.getMatrix(1, 1);
            expect(result).toEqual(mockLines);
            expect(mockLineRepo.find).toHaveBeenCalledWith(expect.objectContaining({
                where: { period: { contract: { id: 1 } } },
                relations: expect.arrayContaining(['period', 'contractRoom', 'prices']),
            }));
        });

        it('should throw NotFoundException if matrix is empty', async () => {
            mockLineRepo.find.mockResolvedValue([]);
            await expect(service.getMatrix(1, 1)).rejects.toThrow(NotFoundException);
        });
    });
});
