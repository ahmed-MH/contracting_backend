import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { Arrangement } from './entities/arrangement.entity';
import { Hotel } from './entities/hotel.entity';
import { CreateArrangementDto } from './dto/create-arrangement.dto';
import { UpdateArrangementDto } from './dto/update-arrangement.dto';

@Injectable()
export class ArrangementService {
    constructor(
        @InjectRepository(Arrangement)
        private readonly arrangementRepo: Repository<Arrangement>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
    ) { }

    async createArrangement(hotelId: number, dto: CreateArrangementDto): Promise<Arrangement> {
        const hotel = await this.hotelRepo.findOne({ where: { id: hotelId } });
        if (!hotel) {
            throw new NotFoundException(`Hotel #${hotelId} not found`);
        }
        const arrangement = this.arrangementRepo.create({ ...dto, hotel });
        return this.arrangementRepo.save(arrangement);
    }

    async findAllArrangements(hotelId: number): Promise<Arrangement[]> {
        return this.arrangementRepo.find({ where: { hotelId } });
    }

    async findArchivedArrangements(hotelId: number): Promise<Arrangement[]> {
        return this.arrangementRepo.find({
            withDeleted: true,
            where: { hotelId, deletedAt: Not(IsNull()) },
        });
    }

    async updateArrangement(hotelId: number, id: number, dto: UpdateArrangementDto): Promise<Arrangement> {
        const arrangement = await this.arrangementRepo.findOne({ where: { id, hotelId } });
        if (!arrangement) {
            throw new NotFoundException(`Arrangement #${id} not found in hotel #${hotelId}`);
        }
        Object.assign(arrangement, dto);
        return this.arrangementRepo.save(arrangement);
    }

    async removeArrangement(hotelId: number, id: number): Promise<void> {
        const arrangement = await this.arrangementRepo.findOne({ where: { id, hotelId } });
        if (!arrangement) {
            throw new NotFoundException(`Arrangement #${id} not found in hotel #${hotelId}`);
        }
        await this.arrangementRepo.softDelete(id);
    }

    async restoreArrangement(hotelId: number, id: number): Promise<void> {
        const arrangement = await this.arrangementRepo.findOne({ where: { id, hotelId }, withDeleted: true });
        if (!arrangement) {
            throw new NotFoundException(`Arrangement #${id} not found in hotel #${hotelId}`);
        }
        await this.arrangementRepo.restore(id);
    }
}
