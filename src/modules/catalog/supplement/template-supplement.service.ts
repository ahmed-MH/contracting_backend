import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, Like } from 'typeorm';
import { TemplateSupplement } from './entities/template-supplement.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { CreateTemplateSupplementDto } from './dto/create-template-supplement.dto';
import { UpdateTemplateSupplementDto } from './dto/update-template-supplement.dto';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';
import { PageDto } from '../../../common/dto/page.dto';

@Injectable()
export class TemplateSupplementService {
    /* istanbul ignore next */
    constructor(
        @InjectRepository(TemplateSupplement)
        private readonly templateSupplementRepo: Repository<TemplateSupplement>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
    ) { }

    async findAllTemplateSupplements(
        hotelId: number,
        pageOptions: PageOptionsDto,
    ): Promise<PageDto<TemplateSupplement>> {
        const where: Record<string, unknown> = { hotel: { id: hotelId } };

        if (pageOptions.search) {
            where.name = Like(`%${pageOptions.search}%`);
        }

        const [data, total] = await this.templateSupplementRepo.findAndCount({
            where,
            order: { id: 'DESC' },
            skip: pageOptions.skip,
            take: pageOptions.limit,
        });

        return new PageDto(data, total, pageOptions.page, pageOptions.limit);
    }

    async findArchivedTemplateSupplements(hotelId: number): Promise<TemplateSupplement[]> {
        return this.templateSupplementRepo.find({
            withDeleted: true,
            where: { hotel: { id: hotelId }, deletedAt: Not(IsNull()) },
        });
    }

    async createTemplateSupplement(
        hotelId: number,
        dto: CreateTemplateSupplementDto,
    ): Promise<TemplateSupplement> {
        const hotel = await this.hotelRepo.findOne({ where: { id: hotelId } });
        if (!hotel) {
            throw new NotFoundException(`Hotel #${hotelId} not found`);
        }

        const supplement = this.templateSupplementRepo.create({
            ...dto,
            hotel,
        });

        return this.templateSupplementRepo.save(supplement);
    }

    async updateTemplateSupplement(
        hotelId: number,
        id: number,
        dto: UpdateTemplateSupplementDto,
    ): Promise<TemplateSupplement> {
        const supplement = await this.templateSupplementRepo.findOne({
            where: { id, hotel: { id: hotelId } },
        });
        if (!supplement) {
            throw new NotFoundException(`TemplateSupplement #${id} not found in hotel #${hotelId}`);
        }
        Object.assign(supplement, dto);
        return this.templateSupplementRepo.save(supplement);
    }

    async removeTemplateSupplement(hotelId: number, id: number): Promise<void> {
        const supplement = await this.templateSupplementRepo.findOne({
            where: { id, hotel: { id: hotelId } },
        });
        if (!supplement) {
            throw new NotFoundException(`TemplateSupplement #${id} not found in hotel #${hotelId}`);
        }
        await this.templateSupplementRepo.softDelete(id);
    }

    async restoreTemplateSupplement(hotelId: number, id: number): Promise<void> {
        const supplement = await this.templateSupplementRepo.findOne({
            where: { id, hotel: { id: hotelId } },
            withDeleted: true,
        });
        if (!supplement) {
            throw new NotFoundException(`TemplateSupplement #${id} not found in hotel #${hotelId}`);
        }
        await this.templateSupplementRepo.restore(id);
    }

    async findOneTemplateSupplement(hotelId: number, id: number): Promise<TemplateSupplement> {
        const supplement = await this.templateSupplementRepo.findOne({
            where: { id, hotel: { id: hotelId } },
        });
        if (!supplement) {
            throw new NotFoundException(`TemplateSupplement #${id} not found in hotel #${hotelId}`);
        }
        return supplement;
    }
}
