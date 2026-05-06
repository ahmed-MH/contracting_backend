import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { ContractStatus } from '../../common/constants/enums';
import { Contract } from '../contract/core/entities/contract.entity';
import { SimulationContractMatcherService } from './simulation-contract-matcher.service';

describe('SimulationContractMatcherService', () => {
    let service: SimulationContractMatcherService;

    const contractRepo = {
        find: jest.fn(),
    };

    const makeContract = (overrides: Partial<Contract> = {}) => ({
        id: 1,
        reference: 'CTR-001',
        name: 'Summer 2026',
        hotelId: 1,
        status: ContractStatus.ACTIVE,
        startDate: new Date('2026-05-01'),
        endDate: new Date('2026-10-31'),
        currency: 'EUR',
        affiliates: [{ id: 10, companyName: 'Partner A' }],
        baseArrangement: { id: 3, name: 'Half Board', code: 'HB' },
        ...overrides,
    } as Contract);

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SimulationContractMatcherService,
                { provide: getRepositoryToken(Contract), useValue: contractRepo },
            ],
        }).compile();

        service = module.get(SimulationContractMatcherService);
        jest.clearAllMocks();
        contractRepo.find.mockResolvedValue([]);
    });

    it('returns no match when no active contract covers the stay', async () => {
        contractRepo.find.mockResolvedValue([]);

        const result = await service.match({
            hotelId: 1,
            affiliateId: 10,
            checkIn: '2026-06-01',
            checkOut: '2026-06-05',
        });

        expect(result.status).toBe('none');
        expect(result.candidates).toEqual([]);
        expect(result.reason).toContain('No active contract');
    });

    it('returns a single match and auto-selected contract id', async () => {
        contractRepo.find.mockResolvedValue([makeContract()]);

        const result = await service.match({
            hotelId: 1,
            affiliateId: 10,
            checkIn: '2026-06-01',
            checkOut: '2026-06-05',
        });

        expect(contractRepo.find).toHaveBeenCalledWith(expect.objectContaining({
            where: [{ hotelId: 1, status: ContractStatus.ACTIVE }],
            relations: ['affiliates', 'baseArrangement'],
        }));
        expect(result.status).toBe('single');
        expect(result.autoSelectedContractId).toBe(1);
        expect(result.candidates[0]).toMatchObject({
            contractId: 1,
            reference: 'CTR-001',
            name: 'Summer 2026',
            status: ContractStatus.ACTIVE,
            startDate: '2026-05-01',
            endDate: '2026-10-31',
            currency: 'EUR',
            affiliate: { id: 10, companyName: 'Partner A' },
            baseArrangement: { id: 3, name: 'Half Board', code: 'HB' },
        });
    });

    it('returns multiple matches when more than one active contract fully covers the stay', async () => {
        contractRepo.find.mockResolvedValue([
            makeContract({ id: 1, reference: 'CTR-001' }),
            makeContract({ id: 2, reference: 'CTR-002', name: 'Long Stay 2026' }),
        ]);

        const result = await service.match({
            hotelId: 1,
            affiliateId: 10,
            checkIn: '2026-06-01',
            checkOut: '2026-06-05',
        });

        expect(result.status).toBe('multiple');
        expect(result.autoSelectedContractId).toBeUndefined();
        expect(result.candidates.map((candidate) => candidate.contractId)).toEqual([1, 2]);
    });

    it('rejects selected contract validation for the wrong affiliate', async () => {
        contractRepo.find.mockResolvedValue([makeContract({ affiliates: [{ id: 11, companyName: 'Partner B' }] as any })]);

        await expect(service.assertContractMatches({
            hotelId: 1,
            affiliateId: 10,
            contractId: 1,
            checkIn: '2026-06-01',
            checkOut: '2026-06-05',
        })).rejects.toThrow('is not valid for affiliate #10');
    });

    it('rejects selected contract validation when the contract does not fully cover the stay', async () => {
        contractRepo.find.mockResolvedValue([makeContract({ startDate: new Date('2026-06-02') })]);

        await expect(service.assertContractMatches({
            hotelId: 1,
            affiliateId: 10,
            contractId: 1,
            checkIn: '2026-06-01',
            checkOut: '2026-06-05',
        })).rejects.toThrow('is not valid for affiliate #10');
    });

    it('excludes inactive contracts by default', async () => {
        contractRepo.find.mockResolvedValue([makeContract({ status: ContractStatus.DRAFT })]);

        const result = await service.match({
            hotelId: 1,
            affiliateId: 10,
            checkIn: '2026-06-01',
            checkOut: '2026-06-05',
        });

        expect(contractRepo.find).toHaveBeenCalledWith(expect.objectContaining({
            where: [{ hotelId: 1, status: ContractStatus.ACTIVE }],
        }));
        expect(result.status).toBe('none');
    });

    it('includes expired and terminated contracts when includeInactive is enabled', async () => {
        contractRepo.find.mockResolvedValue([
            makeContract({ id: 2, status: ContractStatus.EXPIRED, reference: 'CTR-EXP' }),
            makeContract({ id: 3, status: ContractStatus.TERMINATED, reference: 'CTR-TERM' }),
        ]);

        const result = await service.match({
            hotelId: 1,
            affiliateId: 10,
            checkIn: '2026-06-01',
            checkOut: '2026-06-05',
            includeInactive: true,
        });

        expect(contractRepo.find).toHaveBeenCalledWith(expect.objectContaining({
            where: [
                { hotelId: 1, status: ContractStatus.ACTIVE },
                { hotelId: 1, status: ContractStatus.EXPIRED },
                { hotelId: 1, status: ContractStatus.TERMINATED },
            ],
        }));
        expect(result.status).toBe('multiple');
        expect(result.candidates.map((candidate) => candidate.status)).toEqual([
            ContractStatus.EXPIRED,
            ContractStatus.TERMINATED,
        ]);
    });

    it('rejects invalid date ranges', async () => {
        await expect(service.match({
            hotelId: 1,
            affiliateId: 10,
            checkIn: '2026-06-05',
            checkOut: '2026-06-01',
        })).rejects.toThrow(BadRequestException);
    });
});
