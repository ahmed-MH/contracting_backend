import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { HotelService } from './hotel.service';
import { Hotel } from './entities/hotel.entity';
import { UserRole } from '../../common/constants/enums';

jest.mock('fs/promises', () => ({
    mkdir: jest.fn(),
    writeFile: jest.fn(),
}));

jest.mock('crypto', () => ({
    randomUUID: jest.fn(),
}));

describe('HotelService logo upload hardening', () => {
    let service: HotelService;
    let hotelRepo: {
        findOne: jest.Mock;
        save: jest.Mock;
        find: jest.Mock;
        create: jest.Mock;
        preload: jest.Mock;
        softDelete: jest.Mock;
        restore: jest.Mock;
    };

    beforeEach(async () => {
        hotelRepo = {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            preload: jest.fn(),
            softDelete: jest.fn(),
            restore: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                HotelService,
                {
                    provide: getRepositoryToken(Hotel),
                    useValue: hotelRepo,
                },
            ],
        }).compile();

        service = module.get<HotelService>(HotelService);
        jest.clearAllMocks();
        jest.spyOn(Date, 'now').mockReturnValue(1_770_000_000_000);
        (randomUUID as jest.Mock).mockReturnValue('logo-uuid');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('stores a PNG logo locally and persists the /uploads path on the hotel', async () => {
        const hotel = { id: 12, logoUrl: null } as Hotel;
        hotelRepo.findOne.mockResolvedValue(hotel);
        hotelRepo.save.mockImplementation(async (value) => value);

        const result = await service.updateHotelLogo(12, {
            mimetype: 'image/png',
            buffer: Buffer.from('png-bytes'),
        }, {
            id: 44,
            role: UserRole.ADMIN,
            tenantId: 9,
        });

        expect(hotelRepo.findOne).toHaveBeenCalledWith({
            where: { id: 12, tenantId: 9 },
        });
        expect(mkdir).toHaveBeenCalled();
        expect(writeFile).toHaveBeenCalled();
        expect(result.logoUrl).toBe('/uploads/hotels/logos/hotel-12-1770000000000-logo-uuid.png');
        expect(hotelRepo.save).toHaveBeenCalledWith(expect.objectContaining({
            id: 12,
            logoUrl: '/uploads/hotels/logos/hotel-12-1770000000000-logo-uuid.png',
        }));
    });

    it('rejects unsupported logo formats before writing any file', async () => {
        const hotel = { id: 15, logoUrl: null } as Hotel;
        hotelRepo.findOne.mockResolvedValue(hotel);

        await expect(service.updateHotelLogo(15, {
            mimetype: 'image/webp',
            buffer: Buffer.from('webp'),
        }, {
            id: 44,
            role: UserRole.ADMIN,
            tenantId: 9,
        })).rejects.toThrow(BadRequestException);

        expect(writeFile).not.toHaveBeenCalled();
        expect(hotelRepo.save).not.toHaveBeenCalled();
    });

    it('does not allow an admin to update a hotel outside their tenant scope', async () => {
        hotelRepo.findOne.mockResolvedValue(null);

        await expect(service.updateHotelLogo(18, {
            mimetype: 'image/jpeg',
            buffer: Buffer.from('jpeg'),
        }, {
            id: 99,
            role: UserRole.ADMIN,
            tenantId: 3,
        })).rejects.toThrow(NotFoundException);

        expect(hotelRepo.findOne).toHaveBeenCalledWith({
            where: { id: 18, tenantId: 3 },
        });
        expect(writeFile).not.toHaveBeenCalled();
    });

    it('keeps archived hotel queries tenant-scoped for admins', async () => {
        hotelRepo.find.mockResolvedValue([]);

        await service.findArchivedHotels({
            id: 7,
            role: UserRole.ADMIN,
            tenantId: null,
        });

        expect(hotelRepo.find).toHaveBeenCalledWith({
            withDeleted: true,
            where: {
                deletedAt: expect.any(Object),
                tenantId: IsNull(),
            },
        });
    });
});
