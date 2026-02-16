import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Hotel } from './entities/hotel.entity';
import { RoomType } from './entities/room-type.entity';
import { Arrangement } from './entities/arrangement.entity';
import { Affiliate } from '../contract/entities/affiliate.entity';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { CreateRoomTypeDto } from './dto/create-room-type.dto';
import { UpdateRoomTypeDto } from './dto/update-room-type.dto';
import { CreateArrangementDto } from './dto/create-arrangement.dto';
import { UpdateArrangementDto } from './dto/update-arrangement.dto';
import { CreateAffiliateDto } from './dto/create-affiliate.dto';
import { UpdateAffiliateDto } from './dto/update-affiliate.dto';

@Injectable()
export class HotelService {
    constructor(
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,

        @InjectRepository(RoomType)
        private readonly roomTypeRepo: Repository<RoomType>,

        @InjectRepository(Arrangement)
        private readonly arrangementRepo: Repository<Arrangement>,

        @InjectRepository(Affiliate)
        private readonly affiliateRepo: Repository<Affiliate>,
    ) { }

    // ─── Hotel ────────────────────────────────────────────────────────

    async createHotel(dto: CreateHotelDto): Promise<Hotel> {
        const hotel = this.hotelRepo.create(dto);
        return this.hotelRepo.save(hotel);
    }

    async findAllHotels(): Promise<Hotel[]> {
        return this.hotelRepo.find();
    }

    async updateHotel(id: number, dto: UpdateHotelDto): Promise<Hotel> {
        const hotel = await this.hotelRepo.preload({ id, ...dto });
        if (!hotel) {
            throw new NotFoundException(`Hotel #${id} not found`);
        }
        return this.hotelRepo.save(hotel);
    }

    // ─── Room Types ───────────────────────────────────────────────────

    private validateOccupancyRanges(dto: Partial<CreateRoomTypeDto>): void {
        if (dto.minOccupancy !== undefined && dto.maxOccupancy !== undefined && dto.minOccupancy > dto.maxOccupancy) {
            throw new BadRequestException('minOccupancy cannot be greater than maxOccupancy');
        }
        if (dto.minAdults !== undefined && dto.maxAdults !== undefined && dto.minAdults > dto.maxAdults) {
            throw new BadRequestException('minAdults cannot be greater than maxAdults');
        }
        if (dto.minChildren !== undefined && dto.maxChildren !== undefined && dto.minChildren > dto.maxChildren) {
            throw new BadRequestException('minChildren cannot be greater than maxChildren');
        }
    }

    async createRoomType(dto: CreateRoomTypeDto): Promise<RoomType> {
        this.validateOccupancyRanges(dto);
        const roomType = this.roomTypeRepo.create(dto);
        return this.roomTypeRepo.save(roomType);
    }

    async findAllRoomTypes(): Promise<RoomType[]> {
        return this.roomTypeRepo.find();
    }

    async updateRoomType(id: number, dto: UpdateRoomTypeDto): Promise<RoomType> {
        this.validateOccupancyRanges(dto);
        const room = await this.roomTypeRepo.preload({ id, ...dto });
        if (!room) {
            throw new NotFoundException(`RoomType #${id} not found`);
        }
        // Cross-validate merged values (partial update may only update one side)
        if (room.minOccupancy > room.maxOccupancy) {
            throw new BadRequestException('minOccupancy cannot be greater than maxOccupancy after merge');
        }
        if (room.minAdults > room.maxAdults) {
            throw new BadRequestException('minAdults cannot be greater than maxAdults after merge');
        }
        if (room.minChildren > room.maxChildren) {
            throw new BadRequestException('minChildren cannot be greater than maxChildren after merge');
        }
        return this.roomTypeRepo.save(room);
    }

    async removeRoomType(id: number): Promise<void> {
        const result = await this.roomTypeRepo.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`RoomType #${id} not found`);
        }
    }

    // ─── Arrangements ─────────────────────────────────────────────────

    async createArrangement(dto: CreateArrangementDto): Promise<Arrangement> {
        const arrangement = this.arrangementRepo.create(dto);
        return this.arrangementRepo.save(arrangement);
    }

    async findAllArrangements(): Promise<Arrangement[]> {
        return this.arrangementRepo.find();
    }

    async updateArrangement(id: number, dto: UpdateArrangementDto): Promise<Arrangement> {
        const arrangement = await this.arrangementRepo.preload({ id, ...dto });
        if (!arrangement) {
            throw new NotFoundException(`Arrangement #${id} not found`);
        }
        return this.arrangementRepo.save(arrangement);
    }

    async removeArrangement(id: number): Promise<void> {
        const result = await this.arrangementRepo.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`Arrangement #${id} not found`);
        }
    }

    // ─── Affiliates ───────────────────────────────────────────────────

    async createAffiliate(dto: CreateAffiliateDto): Promise<Affiliate> {
        const affiliate = this.affiliateRepo.create(dto);
        return this.affiliateRepo.save(affiliate);
    }

    async findAllAffiliates(): Promise<Affiliate[]> {
        return this.affiliateRepo.find();
    }

    async updateAffiliate(id: number, dto: UpdateAffiliateDto): Promise<Affiliate> {
        const affiliate = await this.affiliateRepo.preload({ id, ...dto });
        if (!affiliate) {
            throw new NotFoundException(`Affiliate #${id} not found`);
        }
        return this.affiliateRepo.save(affiliate);
    }

    async removeAffiliate(id: number): Promise<void> {
        const result = await this.affiliateRepo.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`Affiliate #${id} not found`);
        }
    }
}
