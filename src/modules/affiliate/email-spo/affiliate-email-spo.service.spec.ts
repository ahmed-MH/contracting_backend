import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
    AffiliateEmailSpoApplicationStep,
    AffiliateEmailSpoStackMode,
    AffiliateEmailSpoStatus,
    AffiliateType,
} from '../../../common/constants/enums';
import { AuditService } from '../../../common/audit/audit.service';
import { Affiliate } from '../entities/affiliate.entity';
import { AffiliateEmailSpo } from './entities/affiliate-email-spo.entity';
import { AffiliateEmailSpoService } from './affiliate-email-spo.service';

describe('AffiliateEmailSpoService', () => {
    let service: AffiliateEmailSpoService;

    const affiliateRepo = {
        findOne: jest.fn(),
    };

    const affiliateEmailSpoRepo = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        delete: jest.fn(),
    };

    const auditService = {
        resolveActor: jest.fn(async () => ({ userId: 9, name: 'Commercial User', email: 'seller@test.local' })),
        applyCreateAudit: jest.fn((entity: any) => entity),
        applyUpdateAudit: jest.fn((entity: any) => entity),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AffiliateEmailSpoService,
                { provide: getRepositoryToken(Affiliate), useValue: affiliateRepo },
                { provide: getRepositoryToken(AffiliateEmailSpo), useValue: affiliateEmailSpoRepo },
                { provide: AuditService, useValue: auditService },
            ],
        }).compile();

        service = module.get(AffiliateEmailSpoService);
        jest.resetAllMocks();

        affiliateRepo.findOne.mockResolvedValue({
            id: 4,
            hotelId: 1,
            companyName: 'Solferias',
            affiliateType: AffiliateType.TOUR_OPERATOR,
        });
        affiliateEmailSpoRepo.create.mockImplementation((value) => value);
        affiliateEmailSpoRepo.save.mockImplementation(async (value) => ({ id: 1, ...value }));
        affiliateEmailSpoRepo.find.mockResolvedValue([]);
        affiliateEmailSpoRepo.findOne.mockResolvedValue(null);
        affiliateEmailSpoRepo.delete.mockResolvedValue({ affected: 1 });
    });

    it('creates an active Email SPO when the payload is valid', async () => {
        const result = await service.create(1, 4, {
            name: 'Portugal Flash Offer',
            discountPercent: 5,
            applicationFrom: '2026-05-25',
            applicationTo: '2026-06-25',
            stackMode: AffiliateEmailSpoStackMode.ROLLING,
            applicationStep: AffiliateEmailSpoApplicationStep.AFTER_EARLY_BOOKING,
        });

        expect(result).toEqual(expect.objectContaining({
            id: 1,
            hotelId: 1,
            affiliateId: 4,
            name: 'Portugal Flash Offer',
            status: AffiliateEmailSpoStatus.ACTIVE,
        }));
    });

    it('rejects inverted application dates', async () => {
        await expect(
            service.create(1, 4, {
                name: 'Invalid Offer',
                discountPercent: 5,
                applicationFrom: '2026-06-25',
                applicationTo: '2026-05-25',
            }),
        ).rejects.toThrow(BadRequestException);
    });

    it('rejects overlapping active Email SPOs for the same affiliate', async () => {
        affiliateEmailSpoRepo.findOne.mockResolvedValueOnce({
            id: 10,
            affiliateId: 4,
            hotelId: 1,
            status: AffiliateEmailSpoStatus.ACTIVE,
            applicationFrom: '2026-06-01',
            applicationTo: '2026-06-30',
        });

        await expect(
            service.create(1, 4, {
                name: 'Overlap',
                discountPercent: 7,
                applicationFrom: '2026-06-15',
                applicationTo: '2026-06-20',
            }),
        ).rejects.toThrow('already overlaps');
    });

    it('allows overlapping ranges when the Email SPO is inactive', async () => {
        affiliateEmailSpoRepo.findOne.mockResolvedValueOnce({
            id: 10,
            affiliateId: 4,
            hotelId: 1,
            status: AffiliateEmailSpoStatus.ACTIVE,
            applicationFrom: '2026-06-01',
            applicationTo: '2026-06-30',
        });

        const result = await service.create(1, 4, {
            name: 'Inactive overlap',
            discountPercent: 7,
            applicationFrom: '2026-06-15',
            applicationTo: '2026-06-20',
            status: AffiliateEmailSpoStatus.INACTIVE,
        });

        expect(result.status).toBe(AffiliateEmailSpoStatus.INACTIVE);
    });

    it('creates the same Email SPO for multiple affiliates and skips overlapping ones', async () => {
        affiliateRepo.findOne.mockImplementation(async ({ where }: { where: { id: number; hotelId: number } }) => ({
            id: where.id,
            hotelId: where.hotelId,
            companyName: `Partner ${where.id}`,
            affiliateType: AffiliateType.TOUR_OPERATOR,
        }));
        affiliateEmailSpoRepo.save.mockImplementation(async (value) => ({ id: value.affiliateId * 10, ...value }));
        affiliateEmailSpoRepo.findOne.mockImplementation(async ({ where }: { where: { affiliateId?: number } }) => (
            where.affiliateId === 5
                ? {
                    id: 99,
                    affiliateId: 5,
                    hotelId: 1,
                    status: AffiliateEmailSpoStatus.ACTIVE,
                    applicationFrom: '2026-06-01',
                    applicationTo: '2026-06-30',
                }
                : null
        ));

        const result = await service.createBulk(1, {
            affiliateIds: [4, 5, 6, 4],
            name: 'Summer Email SPO',
            discountPercent: 10,
            applicationFrom: '2026-06-15',
            applicationTo: '2026-06-20',
        });

        expect(result.created).toHaveLength(2);
        expect(result.created.map((item) => item.affiliateId)).toEqual([4, 6]);
        expect(result.skipped).toEqual([
            expect.objectContaining({
                affiliateId: 5,
                affiliateName: 'Partner 5',
            }),
        ]);
    });

    it('rejects cross-hotel affiliate access', async () => {
        affiliateRepo.findOne.mockResolvedValueOnce(null);
        await expect(service.findAll(1, 999)).rejects.toThrow(NotFoundException);
    });
});
