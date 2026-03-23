import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, Like } from 'typeorm';
import { TemplateReduction } from './entities/template-reduction.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { CreateTemplateReductionDto } from './dto/create-template-reduction.dto';
import { UpdateTemplateReductionDto } from './dto/update-template-reduction.dto';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';
import { PageDto } from '../../../common/dto/page.dto';

@Injectable()
export class TemplateReductionService {
    constructor(
        @InjectRepository(TemplateReduction)
        private readonly templateReductionRepo: Repository<TemplateReduction>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
    ) { }

    async findAllTemplateReductions(
        hotelId: number,
        pageOptions: PageOptionsDto,
    ): Promise<PageDto<TemplateReduction>> {
        const where: Record<string, unknown> = { hotelId };

        if (pageOptions.search) {
            where.name = Like(`%${pageOptions.search}%`);
        }

        const [data, total] = await this.templateReductionRepo.findAndCount({
            where,
            order: { id: 'DESC' },
            skip: pageOptions.skip,
            take: pageOptions.limit,
        });

        return new PageDto(data, total, pageOptions.page, pageOptions.limit);
    }

    async findArchivedTemplateReductions(hotelId: number): Promise<TemplateReduction[]> {
        return this.templateReductionRepo.find({
            withDeleted: true,
            where: { hotelId, deletedAt: Not(IsNull()) },
        });
    }

    async createTemplateReduction(
        hotelId: number,
        dto: CreateTemplateReductionDto,
    ): Promise<TemplateReduction> {
        const hotel = await this.hotelRepo.findOne({ where: { id: hotelId } });
        if (!hotel) {
            throw new NotFoundException(`Hotel #${hotelId} not found`);
        }
        const reduction = this.templateReductionRepo.create({ ...dto, hotel });
        return this.templateReductionRepo.save(reduction);
    }

    async updateTemplateReduction(
        hotelId: number,
        id: number,
        dto: UpdateTemplateReductionDto,
    ): Promise<TemplateReduction> {
        const reduction = await this.templateReductionRepo.findOne({
            where: { id, hotelId },
        });
        if (!reduction) {
            throw new NotFoundException(`TemplateReduction #${id} not found in hotel #${hotelId}`);
        }
        Object.assign(reduction, dto);
        return this.templateReductionRepo.save(reduction);
    }

    async removeTemplateReduction(hotelId: number, id: number): Promise<void> {
        const reduction = await this.templateReductionRepo.findOne({
            where: { id, hotelId },
        });
        if (!reduction) {
            throw new NotFoundException(`TemplateReduction #${id} not found in hotel #${hotelId}`);
        }
        await this.templateReductionRepo.softDelete(id);
    }

    async restoreTemplateReduction(hotelId: number, id: number): Promise<void> {
        const reduction = await this.templateReductionRepo.findOne({
            where: { id, hotelId },
            withDeleted: true,
        });
        if (!reduction) {
            throw new NotFoundException(`TemplateReduction #${id} not found in hotel #${hotelId}`);
        }
        await this.templateReductionRepo.restore(id);
    }
}
