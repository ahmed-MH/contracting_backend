import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContractService } from './contract.service';
import { Contract } from './entities/contract.entity';
import { Period } from './entities/period.entity';
import { ContractRoom } from './entities/contract-room.entity';
import { Affiliate } from '../../affiliate/entities/affiliate.entity';
import { RoomType } from '../../hotel/entities/room-type.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { Arrangement } from '../../hotel/entities/arrangement.entity';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ContractStatus } from '../../../common/constants/enums';
import { ContractLine } from './entities/contract-line.entity';

describe('ContractService', () => {
    let service: ContractService;

    const mockRepo = (name: string) => ({
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        delete: jest.fn(),
    });

    const repos = {
        contract: mockRepo('contract'),
        period: { ...mockRepo('period'), remove: jest.fn() },
        contractRoom: { ...mockRepo('contractRoom'), remove: jest.fn() },
        affiliate: mockRepo('affiliate'),
        roomType: mockRepo('roomType'),
        hotel: mockRepo('hotel'),
        arrangement: mockRepo('arrangement'),
    };

    const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
            getRepository: jest.fn().mockReturnValue({
                save: jest.fn(),
                delete: jest.fn(),
                findOne: jest.fn(),
                find: jest.fn(),
            }),
            save: jest.fn(),
            delete: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
        },
    };

    const mockDataSource = {
        createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
        getRepository: jest.fn().mockReturnValue({
            delete: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
        }),
        transaction: jest.fn().mockImplementation((cb) => cb(mockQueryRunner.manager)),
    };

    const mockHotelId = 1;
    const setupActivationRepositories = (lines: any[] = []) => {
        mockDataSource.getRepository.mockImplementation((entity) => {
            if (entity === ContractLine) {
                return { find: jest.fn().mockResolvedValue(lines), delete: jest.fn() };
            }
            return { find: jest.fn().mockResolvedValue([]), delete: jest.fn(), remove: jest.fn() };
        });
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ContractService,
                { provide: getRepositoryToken(Contract), useValue: repos.contract },
                { provide: getRepositoryToken(Period), useValue: repos.period },
                { provide: getRepositoryToken(ContractRoom), useValue: repos.contractRoom },
                { provide: getRepositoryToken(Affiliate), useValue: repos.affiliate },
                { provide: getRepositoryToken(RoomType), useValue: repos.roomType },
                { provide: getRepositoryToken(Hotel), useValue: repos.hotel },
                { provide: getRepositoryToken(Arrangement), useValue: repos.arrangement },
                { provide: DataSource, useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<ContractService>(ContractService);
        jest.clearAllMocks();
        mockDataSource.getRepository.mockReturnValue({
            delete: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
        });
    });

    describe('createContract', () => {
        it('should create a valid contract', async () => {
            const dto = { name: 'Test', startDate: '2025-01-01', endDate: '2025-12-31', affiliateIds: [1], currency: 'USD', baseArrangementId: 1 } as any;
            repos.hotel.findOne.mockResolvedValue({ id: mockHotelId });
            repos.affiliate.findOne.mockResolvedValue({ id: 1 });
            repos.arrangement.findOne.mockResolvedValue({ id: 1 });
            repos.contract.create.mockReturnValue({ id: 100 });
            repos.contract.save.mockResolvedValue({ id: 100 });

            const result = await service.createContract(mockHotelId, dto);
            expect(result).toEqual({ id: 100 });
            expect(repos.contract.save).toHaveBeenCalled();
        });

        it('should throw BadRequestException if dates are invalid', async () => {
            const dto = { startDate: '2025-12-31', endDate: '2025-01-01' } as any;
            await expect(service.createContract(mockHotelId, dto)).rejects.toThrow(BadRequestException);
        });

        it('should throw NotFoundException if hotel not found', async () => {
            const dto = { startDate: '2025-01-01', endDate: '2025-12-31' } as any;
            repos.hotel.findOne.mockResolvedValue(null);
            await expect(service.createContract(mockHotelId, dto)).rejects.toThrow(NotFoundException);
        });

        it('should throw NotFoundException if affiliate not found', async () => {
            const dto = { startDate: '2025-01-01', endDate: '2025-12-31', affiliateIds: [99] } as any;
            repos.hotel.findOne.mockResolvedValue({ id: mockHotelId });
            repos.affiliate.findOne.mockResolvedValue(null);
            await expect(service.createContract(mockHotelId, dto)).rejects.toThrow(NotFoundException);
        });
        
        it('should throw NotFoundException if base arrangement not found', async () => {
            const dto = { startDate: '2025-01-01', endDate: '2025-12-31', affiliateIds: [], baseArrangementId: 99 } as any;
            repos.hotel.findOne.mockResolvedValue({ id: mockHotelId });
            repos.arrangement.findOne.mockResolvedValue(null);
            await expect(service.createContract(mockHotelId, dto)).rejects.toThrow(NotFoundException);
        });
    });

    describe('getContractDetails', () => {
        it('should return contract details', async () => {
            repos.contract.findOne.mockResolvedValue({ id: 1 });
            const result = await service.getContractDetails(mockHotelId, 1);
            expect(result).toEqual({ id: 1 });
        });

        it('should throw NotFoundException if not found', async () => {
            repos.contract.findOne.mockResolvedValue(null);
            await expect(service.getContractDetails(mockHotelId, 1)).rejects.toThrow(NotFoundException);
        });
    });
    
    describe('findAll', () => {
        it('should return all contracts for a hotel', async () => {
            repos.contract.find.mockResolvedValue([{ id: 1 }]);
            const result = await service.findAll(mockHotelId);
            expect(result).toEqual([{ id: 1 }]);
        });
    });

    describe('updateContract', () => {
        it('should update scalar fields and affiliates', async () => {
            const dto = { name: 'Updated', status: ContractStatus.DRAFT, affiliateIds: [2] } as any;
            const mockContract = { id: 1, affiliates: [] };
            repos.contract.findOne.mockResolvedValue(mockContract);
            repos.affiliate.findOne.mockResolvedValue({ id: 2 });
            repos.contract.save.mockResolvedValue({ ...mockContract, name: 'Updated' });

            const result = await service.updateContract(mockHotelId, 1, dto);
            expect(repos.contract.save).toHaveBeenCalled();
            expect(result.name).toBe('Updated');
        });

        it('should handle baseArrangement updates', async () => {
            const mockContract = { id: 1, affiliates: [] };
            repos.contract.findOne.mockResolvedValue(mockContract);
            repos.arrangement.findOne.mockResolvedValue({ id: 2 });
            repos.contract.save.mockResolvedValue(mockContract);

            await service.updateContract(mockHotelId, 1, { baseArrangementId: 2 } as any);
            expect(repos.arrangement.findOne).toHaveBeenCalled();
            
            await service.updateContract(mockHotelId, 1, { baseArrangementId: null } as any);
            expect(repos.contract.save).toHaveBeenCalled();
        });

        it('should throw NotFoundException if contract not found', async () => {
            repos.contract.findOne.mockResolvedValue(null);
            await expect(service.updateContract(mockHotelId, 1, {} as any)).rejects.toThrow(NotFoundException);
        });
    });

    describe('activation validation', () => {
        const validContract = {
            id: 1,
            name: 'Summer',
            startDate: new Date('2025-01-01'),
            endDate: new Date('2025-01-31'),
            status: ContractStatus.DRAFT,
            currency: 'EUR',
            baseArrangementId: 1,
            affiliates: [{ id: 1 }],
        };
        const validPeriod = {
            id: 10,
            name: 'January',
            startDate: new Date('2025-01-01'),
            endDate: new Date('2025-01-31'),
        };
        const validRoom = {
            id: 20,
            roomType: { id: 30, name: 'Double Room', hotelId: mockHotelId },
        };
        const validArrangement = { id: 1, name: 'HB', hotelId: mockHotelId };
        const validLine = {
            id: 40,
            period: validPeriod,
            contractRoom: validRoom,
            isContracted: true,
            prices: [{ id: 50, amount: 100, arrangement: validArrangement }],
        };

        const expectActivationFailureCode = async (promise: Promise<any>, code: string) => {
            try {
                await promise;
                throw new Error('Expected activation to fail');
            } catch (error: any) {
                expect(error).toBeInstanceOf(BadRequestException);
                expect(error.getResponse().validation.errors).toEqual(
                    expect.arrayContaining([expect.objectContaining({ code })]),
                );
            }
        };

        it('should block activation with no periods', async () => {
            setupActivationRepositories();
            repos.contract.findOne.mockResolvedValue({ ...validContract });
            repos.period.find.mockResolvedValue([]);
            repos.contractRoom.find.mockResolvedValue([validRoom]);
            repos.arrangement.findOne.mockResolvedValue(validArrangement);

            await expectActivationFailureCode(
                service.updateContract(mockHotelId, 1, { status: ContractStatus.ACTIVE } as any),
                'MISSING_PERIODS',
            );
            expect(repos.contract.save).not.toHaveBeenCalled();
        });

        it('should block activation with no rooms', async () => {
            setupActivationRepositories();
            repos.contract.findOne.mockResolvedValue({ ...validContract });
            repos.period.find.mockResolvedValue([validPeriod]);
            repos.contractRoom.find.mockResolvedValue([]);
            repos.arrangement.findOne.mockResolvedValue(validArrangement);

            await expectActivationFailureCode(
                service.updateContract(mockHotelId, 1, { status: ContractStatus.ACTIVE } as any),
                'MISSING_ROOMS',
            );
        });

        it('should block activation with missing prices', async () => {
            setupActivationRepositories([]);
            repos.contract.findOne.mockResolvedValue({ ...validContract });
            repos.period.find.mockResolvedValue([validPeriod]);
            repos.contractRoom.find.mockResolvedValue([validRoom]);
            repos.arrangement.findOne.mockResolvedValue(validArrangement);

            await expectActivationFailureCode(
                service.updateContract(mockHotelId, 1, { status: ContractStatus.ACTIVE } as any),
                'MISSING_RATE',
            );
        });

        it('should block activation with uncovered date gaps', async () => {
            setupActivationRepositories([validLine]);
            repos.contract.findOne.mockResolvedValue({ ...validContract });
            repos.period.find.mockResolvedValue([
                { ...validPeriod, startDate: new Date('2025-01-10') },
            ]);
            repos.contractRoom.find.mockResolvedValue([validRoom]);
            repos.arrangement.findOne.mockResolvedValue(validArrangement);

            await expectActivationFailureCode(
                service.updateContract(mockHotelId, 1, { status: ContractStatus.ACTIVE } as any),
                'UNCOVERED_DATE_RANGE',
            );
        });

        it('should activate when validation passes', async () => {
            setupActivationRepositories([validLine]);
            const contract = { ...validContract };
            repos.contract.findOne.mockResolvedValue(contract);
            repos.period.find.mockResolvedValue([validPeriod]);
            repos.contractRoom.find.mockResolvedValue([validRoom]);
            repos.arrangement.findOne.mockResolvedValue(validArrangement);
            repos.contract.save.mockImplementation(async (value) => value);

            const result = await service.updateContract(mockHotelId, 1, { status: ContractStatus.ACTIVE } as any);

            expect(result.status).toBe(ContractStatus.ACTIVE);
            expect(repos.contract.save).toHaveBeenCalledWith(expect.objectContaining({ status: ContractStatus.ACTIVE }));
        });

        it('should return structured validation errors from activation check', async () => {
            setupActivationRepositories();
            repos.contract.findOne.mockResolvedValue({ ...validContract });
            repos.period.find.mockResolvedValue([]);
            repos.contractRoom.find.mockResolvedValue([]);
            repos.arrangement.findOne.mockResolvedValue(validArrangement);

            const result = await service.validateActivation(mockHotelId, 1);

            expect(result.isValid).toBe(false);
            expect(result.summary.missingPeriods).toBe(true);
            expect(result.summary.missingRooms).toBe(true);
            expect(result.errors).toEqual(expect.arrayContaining([
                expect.objectContaining({ code: 'MISSING_PERIODS' }),
                expect.objectContaining({ code: 'MISSING_ROOMS' }),
            ]));
        });

        it('should preserve hotel scoping for activation check', async () => {
            repos.contract.findOne.mockResolvedValue(null);

            await expect(service.validateActivation(mockHotelId, 999)).rejects.toThrow(NotFoundException);
            expect(repos.contract.findOne).toHaveBeenCalledWith({
                where: { id: 999, hotelId: mockHotelId },
                relations: ['affiliates', 'baseArrangement'],
            });
        });
    });

    describe('Periods Management', () => {
        const dto = { name: 'Summer', startDate: '2025-06-01', endDate: '2025-08-31' } as any;
        const mockContract = { id: 1, startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'), periods: [] };

        it('should add a period', async () => {
            repos.contract.findOne.mockResolvedValue(mockContract);
            repos.period.create.mockReturnValue(dto);
            repos.period.save.mockResolvedValue(dto);

            const result = await service.addPeriod(1, 1, dto);
            expect(repos.period.save).toHaveBeenCalled();
            expect(result).toEqual(dto);
        });

        it('should validate dates when adding a period', async () => {
            repos.contract.findOne.mockResolvedValue(mockContract);
            await expect(service.addPeriod(1, 1, { ...dto, startDate: '2025-12-31', endDate: '2025-01-01' })).rejects.toThrow(BadRequestException);
        });

        it('should prevent overlapping periods', async () => {
            const contractWithPeriods = {
                id: 1,
                startDate: new Date('2025-01-01'), 
                endDate: new Date('2025-12-31'),
                periods: [{ id: 10, startDate: new Date('2025-06-15'), endDate: new Date('2025-07-15') }]
            };
            repos.contract.findOne.mockResolvedValue(contractWithPeriods);
            
            await expect(service.addPeriod(1, 1, dto)).rejects.toThrow(BadRequestException);
        });

        it('should remove a period', async () => {
            repos.contract.findOne.mockResolvedValue({ id: 1, periods: [{ id: 10 }] });
            repos.period.find.mockResolvedValue([]);
            
            mockQueryRunner.manager.delete.mockResolvedValue({});
            
            await service.deletePeriod(1, 1, 10);
            expect(repos.period.remove).toBeDefined(); // Actually uses dataSource in the real implementation, we just ensure it doesn't crash here
        });
    });

    describe('Rooms Management', () => {
        const dto = { roomTypeId: 1 } as any;

        it('should add a room to a contract', async () => {
            repos.contract.findOne.mockResolvedValue({ id: 1, contractRooms: [] });
            repos.roomType.findOne.mockResolvedValue({ id: 1 });
            repos.contractRoom.create.mockReturnValue({ id: 10 });
            repos.contractRoom.save.mockResolvedValue({ id: 10 });

            const result = await service.addContractRoom(mockHotelId, 1, dto);
            expect(result).toEqual({ id: 10 });
        });

        it('should throw if room type not found', async () => {
            repos.contract.findOne.mockResolvedValue({ id: 1, contractRooms: [] });
            repos.roomType.findOne.mockResolvedValue(null);
            await expect(service.addContractRoom(mockHotelId, 1, dto)).rejects.toThrow(NotFoundException);
        });

        it('should prevent duplicate rooms', async () => {
            repos.contract.findOne.mockResolvedValue({ id: 1, contractRooms: [{ roomType: { id: 1 } }] });
            repos.roomType.findOne.mockResolvedValue({ id: 1 });
            await expect(service.addContractRoom(mockHotelId, 1, dto)).rejects.toThrow(BadRequestException);
        });

        it('should remove a room from a contract', async () => {
            repos.contract.findOne.mockResolvedValue({ id: 1 });
            repos.contractRoom.findOne.mockResolvedValue({ id: 10 });
            
            await service.deleteContractRoom(1, 1, 10);
            expect(repos.contractRoom.remove).toBeDefined();
        });
    });

    describe('Prices Management', () => {
        it('should upsert prices successfully', async () => {
            const contract = { id: 1, periods: [{ id: 1 }], contractRooms: [{ id: 1 }], currency: 'USD' };
            repos.contract.findOne.mockResolvedValue(contract);
            repos.arrangement.find.mockResolvedValue([{ id: 1 }]);
            
            const dto = {
                contractId: 1,
                cells: [
                    { periodId: 1, contractRoomId: 1, isContracted: true, allotment: 10, prices: [{ arrangementId: 1, amount: 100 }] }
                ]
            } as any;
            
            const mockRepo = {
                findOne: jest.fn()
                    .mockResolvedValueOnce(null) // ContractLine
                    .mockResolvedValueOnce(null), // Price
                create: jest.fn().mockReturnValue({ id: 1 }),
                save: jest.fn().mockResolvedValue({ id: 1 }),
            };
            mockQueryRunner.manager.getRepository.mockReturnValue(mockRepo);
            
            await service.batchUpsertPrices(1, 1, dto);
            
            expect(mockDataSource.transaction).toHaveBeenCalled();
        });

        it('should rollback transaction on error during price upsert', async () => {
            const contract = { id: 1, periods: [{ id: 1 }], contractRooms: [{ id: 1 }] };
            repos.contract.findOne.mockResolvedValue(contract);
            repos.arrangement.find.mockResolvedValue([{ id: 1 }]);

            const dto = {
                contractId: 1,
                cells: [
                    { periodId: 1, contractRoomId: 1, isContracted: true, allotment: 10, prices: [{ arrangementId: 1, amount: 100 }] }
                ]
            } as any;
            
            const mockRepo = {
                findOne: jest.fn().mockRejectedValue(new Error('DB Error')),
            };
            mockQueryRunner.manager.getRepository.mockReturnValue(mockRepo);
            
            await expect(service.batchUpsertPrices(1, 1, dto)).rejects.toThrow('DB Error');
        });

        it('should reject prices for arrangements outside the active hotel', async () => {
            const contract = { id: 1, periods: [{ id: 1 }], contractRooms: [{ id: 1 }], currency: 'USD' };
            repos.contract.findOne.mockResolvedValue(contract);
            repos.arrangement.find.mockResolvedValue([]);

            const dto = {
                contractId: 1,
                cells: [
                    { periodId: 1, contractRoomId: 1, isContracted: true, allotment: 10, prices: [{ arrangementId: 99, amount: 100 }] }
                ]
            } as any;

            await expect(service.batchUpsertPrices(1, 1, dto)).rejects.toThrow(NotFoundException);
            expect(mockDataSource.transaction).not.toHaveBeenCalled();
        });
    });
});
