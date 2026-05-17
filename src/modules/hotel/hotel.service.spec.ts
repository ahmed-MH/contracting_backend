import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { HotelService } from './hotel.service';
import { Hotel } from './entities/hotel.entity';
import { HotelBankAccount } from './entities/hotel-bank-account.entity';
import { AuditService } from '../../common/audit/audit.service';
import { UserRole } from '../../common/constants/enums';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { TenantUsageService } from '../subscriptions/tenant-usage.service';

describe('HotelService', () => {
    let service: HotelService;

    const actor = { userId: 1, name: 'Admin', email: 'admin@pricify.test' };

    const mockHotelRepo = {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn((data) => ({ ...data })),
        save: jest.fn(),
        softDelete: jest.fn(),
        restore: jest.fn(),
    };

    const mockBankAccountRepo = {
        find: jest.fn(),
        create: jest.fn((data) => ({ ...data })),
        update: jest.fn(),
        save: jest.fn(),
    };

    const mockAuditService = {
        resolveActor: jest.fn().mockResolvedValue(actor),
        applyCreateAudit: jest.fn((entity) => entity),
        applyUpdateAudit: jest.fn((entity) => entity),
    };

    const mockTenantUsageService = {
        assertCanCreateHotel: jest.fn(),
    };

    const baseHotel = {
        id: 1,
        name: 'The Grand Budapest Hotel',
        phone: '+216 73 123 456',
        address: 'Zubrowka Republic',
        legalRepresentative: 'M. Gustave',
        defaultCurrency: 'EUR',
        tenantId: 1,
        bankAccounts: [],
    } as unknown as Hotel;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                HotelService,
                { provide: getRepositoryToken(Hotel), useValue: mockHotelRepo },
                { provide: getRepositoryToken(HotelBankAccount), useValue: mockBankAccountRepo },
                { provide: AuditService, useValue: mockAuditService },
                { provide: TenantUsageService, useValue: mockTenantUsageService },
            ],
        }).compile();

        service = module.get<HotelService>(HotelService);
        jest.clearAllMocks();
        mockHotelRepo.create.mockImplementation((data) => ({ ...data }));
        mockBankAccountRepo.create.mockImplementation((data) => ({ ...data }));
        mockAuditService.resolveActor.mockResolvedValue(actor);
        mockAuditService.applyCreateAudit.mockImplementation((entity) => entity);
        mockAuditService.applyUpdateAudit.mockImplementation((entity) => entity);
        mockTenantUsageService.assertCanCreateHotel.mockResolvedValue(undefined);
    });

    it('creates a hotel and stores multiple bank accounts with one principal', async () => {
        const createDto: CreateHotelDto = {
            name: baseHotel.name,
            phone: baseHotel.phone,
            address: baseHotel.address,
            legalRepresentative: baseHotel.legalRepresentative,
            defaultCurrency: 'TND',
            bankAccounts: [
                {
                    label: 'TND account',
                    bankName: 'BIAT',
                    rib: '123',
                    currency: 'TND',
                    isDefault: true,
                    active: true,
                },
                {
                    label: 'EUR account',
                    bankName: 'STB',
                    iban: 'TN590000',
                    swiftCode: 'STBKTNTT',
                    currency: 'EUR',
                    isDefault: true,
                    active: true,
                },
            ],
        };

        mockHotelRepo.save.mockResolvedValue({ ...baseHotel, id: 1 });
        mockHotelRepo.findOne.mockResolvedValue({ ...baseHotel, bankAccounts: createDto.bankAccounts });
        mockBankAccountRepo.find.mockResolvedValue([]);
        mockBankAccountRepo.update.mockResolvedValue({ affected: 0 });
        mockBankAccountRepo.save.mockResolvedValue([]);

        const result = await service.createHotel(createDto, { id: 1, role: UserRole.ADMIN, tenantId: 1 });

        expect(mockTenantUsageService.assertCanCreateHotel).toHaveBeenCalledWith(1);
        expect(mockHotelRepo.create).toHaveBeenCalledWith(expect.objectContaining({
            name: baseHotel.name,
            tenantId: 1,
        }));
        expect(mockHotelRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            bankName: 'BIAT',
            accountNumber: '123',
        }));
        expect(mockBankAccountRepo.save).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ label: 'TND account', isDefault: true, hotelId: 1 }),
            expect.objectContaining({ label: 'EUR account', isDefault: false, hotelId: 1 }),
        ]));
        expect(result).toEqual(expect.objectContaining({ id: 1 }));
    });

    it('updates bank accounts and promotes the first active account when no principal is selected', async () => {
        const existingHotel = {
            ...baseHotel,
            bankAccounts: [
                { id: 10, hotelId: 1, label: 'Old', isDefault: true, active: true },
            ],
        } as unknown as Hotel;

        mockHotelRepo.findOne.mockResolvedValueOnce(existingHotel).mockResolvedValueOnce({
            ...existingHotel,
            bankAccounts: [],
        });
        mockHotelRepo.save.mockImplementation(async (hotel) => hotel);
        mockBankAccountRepo.find.mockResolvedValue([
            { id: 10, hotelId: 1, label: 'Old', isDefault: true, active: true },
        ]);
        mockBankAccountRepo.update.mockResolvedValue({ affected: 1 });
        mockBankAccountRepo.save.mockResolvedValue([]);

        await service.updateHotel(1, {
            bankAccounts: [
                { id: 10, label: 'Local', bankName: 'BIAT', rib: '123', active: true },
                { label: 'International', bankName: 'STB', iban: 'TN590000', active: true },
            ],
        }, { id: 1, role: UserRole.ADMIN, tenantId: 1 });

        expect(mockBankAccountRepo.update).toHaveBeenCalledWith({ hotelId: 1 }, { isDefault: false });
        expect(mockBankAccountRepo.save).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ id: 10, label: 'Local', isDefault: true }),
            expect.objectContaining({ label: 'International', isDefault: false }),
        ]));
    });

    it('creates a principal bank account from legacy bank fields', async () => {
        const createDto: CreateHotelDto = {
            name: baseHotel.name,
            phone: baseHotel.phone,
            address: baseHotel.address,
            legalRepresentative: baseHotel.legalRepresentative,
            defaultCurrency: 'TND',
            bankName: 'BIAT',
            accountNumber: '123',
            ibanCode: 'TN590000',
            swiftCode: 'BIATTNTT',
        };

        mockHotelRepo.save.mockResolvedValue({ ...baseHotel, id: 1 });
        mockHotelRepo.findOne.mockResolvedValue({ ...baseHotel, bankAccounts: [] });
        mockBankAccountRepo.find.mockResolvedValue([]);
        mockBankAccountRepo.update.mockResolvedValue({ affected: 0 });
        mockBankAccountRepo.save.mockResolvedValue([]);

        await service.createHotel(createDto, { id: 1, role: UserRole.ADMIN, tenantId: 1 });

        expect(mockTenantUsageService.assertCanCreateHotel).toHaveBeenCalledWith(1);
        expect(mockBankAccountRepo.save).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({
                label: 'Principal account',
                bankName: 'BIAT',
                rib: '123',
                iban: 'TN590000',
                swiftCode: 'BIATTNTT',
                isDefault: true,
            }),
        ]));
    });

    it('blocks hotel creation when the tenant plan hotel limit is reached', async () => {
        mockTenantUsageService.assertCanCreateHotel.mockRejectedValue(new Error('Hotel limit reached for current plan.'));

        await expect(service.createHotel({
            name: baseHotel.name,
            phone: baseHotel.phone,
            address: baseHotel.address,
            legalRepresentative: baseHotel.legalRepresentative,
            defaultCurrency: 'TND',
        }, { id: 1, role: UserRole.ADMIN, tenantId: 1 }))
            .rejects
            .toThrow('Hotel limit reached for current plan.');

        expect(mockHotelRepo.save).not.toHaveBeenCalled();
    });

    it('returns hotels scoped for a commercial user with bank accounts loaded', async () => {
        mockHotelRepo.find.mockResolvedValue([baseHotel]);

        const result = await service.findAllHotels({ id: 42, role: UserRole.COMMERCIAL, tenantId: null });

        expect(mockHotelRepo.find).toHaveBeenCalledWith({
            where: { users: { id: 42 } },
            relations: ['users', 'bankAccounts'],
        });
        expect(result).toEqual([baseHotel]);
    });

    it('throws when updating a missing hotel', async () => {
        mockHotelRepo.findOne.mockResolvedValue(null);

        await expect(service.updateHotel(999, { name: 'Ghost Hotel' }, { id: 1, role: UserRole.ADMIN, tenantId: 1 }))
            .rejects
            .toThrow(NotFoundException);
    });
});
