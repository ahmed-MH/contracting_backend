import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { Hotel } from './entities/hotel.entity';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { UserRole } from '../../common/constants/enums';

@Injectable()
export class HotelService {
    /* istanbul ignore next */
    constructor(
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
    ) { }

    // ─── Hotel ────────────────────────────────────────────────────────

    async createHotel(dto: CreateHotelDto, currentUser: { tenantId: number | null }): Promise<Hotel> {
        const hotel = this.hotelRepo.create({
            ...dto,
            tenantId: currentUser.tenantId || undefined,
        });
        return this.hotelRepo.save(hotel);
    }

    async findById(
        id: number,
        user?: { id: number; role: UserRole; tenantId: number | null },
    ): Promise<Hotel | null> {
        if (!user) {
            return this.hotelRepo.findOne({ where: { id } });
        }

        if (user.role === UserRole.SUPERVISOR) {
            return this.hotelRepo.findOne({ where: { id } });
        }

        if (user.role === UserRole.ADMIN) {
            const tenantCondition = user.tenantId ?? IsNull();
            return this.hotelRepo.findOne({ where: { id, tenantId: tenantCondition } });
        }

        if (user.role === UserRole.COMMERCIAL || user.role === UserRole.AGENT) {
            return this.hotelRepo.findOne({
                where: { id, users: { id: user.id } },
                relations: ['users'],
            });
        }

        return this.hotelRepo.findOne({ where: { id } });
    }

    async findAllHotels(user?: { id: number; role: UserRole; tenantId: number | null }): Promise<Hotel[]> {
        if (!user) return this.hotelRepo.find();

        if (user.role === UserRole.SUPERVISOR) {
            return this.hotelRepo.find();
        }

        if (user.role === UserRole.ADMIN) {
            return this.hotelRepo.find({
                where: { tenantId: user.tenantId ?? IsNull() }
            });
        }

        if (user.role === UserRole.COMMERCIAL || user.role === UserRole.AGENT) {
            return this.hotelRepo.find({
                where: {
                    users: { id: user.id }
                },
                relations: ['users']
            });
        }

        return this.hotelRepo.find();
    }

    async findArchivedHotels(): Promise<Hotel[]> {
        return this.hotelRepo.find({
            withDeleted: true,
            where: { deletedAt: Not(IsNull()) },
        });
    }

    async updateHotel(id: number, dto: UpdateHotelDto): Promise<Hotel> {
        const hotel = await this.hotelRepo.preload({ id, ...dto });
        if (!hotel) {
            throw new NotFoundException(`Hotel #${id} not found`);
        }
        return this.hotelRepo.save(hotel);
    }

    async removeHotel(id: number): Promise<void> {
        const result = await this.hotelRepo.softDelete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`Hotel #${id} not found`);
        }
    }

    async restoreHotel(id: number): Promise<void> {
        const result = await this.hotelRepo.restore(id);
        if (result.affected === 0) {
            throw new NotFoundException(`Hotel #${id} not found or not archived`);
        }
    }
}
