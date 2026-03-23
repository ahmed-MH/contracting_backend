import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { RoomType } from './entities/room-type.entity';
import { Hotel } from './entities/hotel.entity';
import { CreateRoomTypeDto } from './dto/create-room-type.dto';
import { UpdateRoomTypeDto } from './dto/update-room-type.dto';

@Injectable()
export class RoomTypeService {
    constructor(
        @InjectRepository(RoomType)
        private readonly roomTypeRepo: Repository<RoomType>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
    ) { }

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

    async createRoomType(hotelId: number, dto: CreateRoomTypeDto): Promise<RoomType> {
        this.validateOccupancyRanges(dto);
        const hotel = await this.hotelRepo.findOne({ where: { id: hotelId } });
        if (!hotel) {
            throw new NotFoundException(`Hotel #${hotelId} not found`);
        }
        const roomType = this.roomTypeRepo.create({ ...dto, hotel });
        return this.roomTypeRepo.save(roomType);
    }

    async findAllRoomTypes(hotelId: number): Promise<RoomType[]> {
        return this.roomTypeRepo.find({ where: { hotelId } });
    }

    async findArchivedRoomTypes(hotelId: number): Promise<RoomType[]> {
        return this.roomTypeRepo.find({
            withDeleted: true,
            where: { hotelId, deletedAt: Not(IsNull()) },
        });
    }

    async updateRoomType(hotelId: number, id: number, dto: UpdateRoomTypeDto): Promise<RoomType> {
        this.validateOccupancyRanges(dto);
        const room = await this.roomTypeRepo.findOne({ where: { id, hotelId } });
        if (!room) {
            throw new NotFoundException(`RoomType #${id} not found in hotel #${hotelId}`);
        }

        // Merge DTO fields onto the existing entity
        Object.assign(room, dto);

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

    async removeRoomType(hotelId: number, id: number): Promise<void> {
        const room = await this.roomTypeRepo.findOne({ where: { id, hotelId } });
        if (!room) {
            throw new NotFoundException(`RoomType #${id} not found in hotel #${hotelId}`);
        }
        await this.roomTypeRepo.softDelete(id);
    }

    async restoreRoomType(hotelId: number, id: number): Promise<void> {
        const room = await this.roomTypeRepo.findOne({ where: { id, hotelId }, withDeleted: true });
        if (!room) {
            throw new NotFoundException(`RoomType #${id} not found in hotel #${hotelId}`);
        }
        await this.roomTypeRepo.restore(id);
    }
}
