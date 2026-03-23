import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, Like } from 'typeorm';
import { TemplateCancellationRule } from './entities/template-cancellation-rule.entity';
import { CreateTemplateCancellationRuleDto, UpdateTemplateCancellationRuleDto } from './dto/template-cancellation.dto';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';
import { PageDto } from '../../../common/dto/page.dto';

@Injectable()
export class TemplateCancellationService {
    constructor(
        @InjectRepository(TemplateCancellationRule)
        private readonly templateRepo: Repository<TemplateCancellationRule>,
    ) { }

    async createTemplateCancellationRule(hotelId: number, dto: CreateTemplateCancellationRuleDto) {
        const template = this.templateRepo.create({
            ...dto,
            hotelId,
        });
        return this.templateRepo.save(template);
    }

    async findAll(hotelId: number, pageOptions: PageOptionsDto): Promise<PageDto<TemplateCancellationRule>> {
        const where: Record<string, unknown> = { hotelId };

        if (pageOptions.search) {
            where.name = Like(`%${pageOptions.search}%`);
        }

        const [data, total] = await this.templateRepo.findAndCount({
            where,
            order: { id: 'DESC' },
            skip: pageOptions.skip,
            take: pageOptions.limit,
        });

        return new PageDto(data, total, pageOptions.page, pageOptions.limit);
    }

    async findArchived(hotelId: number): Promise<TemplateCancellationRule[]> {
        return this.templateRepo.find({
            withDeleted: true,
            where: { hotelId, deletedAt: Not(IsNull()) },
        });
    }

    async findOne(hotelId: number, id: number) {
        const item = await this.templateRepo.findOne({ where: { id, hotelId } });
        if (!item) throw new NotFoundException('Template cancellation rule not found');
        return item;
    }

    async update(hotelId: number, id: number, dto: UpdateTemplateCancellationRuleDto) {
        const item = await this.findOne(hotelId, id);
        Object.assign(item, dto);
        return this.templateRepo.save(item);
    }

    async delete(hotelId: number, id: number) {
        const item = await this.findOne(hotelId, id);
        if (!item) throw new NotFoundException(`TemplateCancellationRule #${id} not found`);
        return this.templateRepo.softDelete(id);
    }

    async restore(hotelId: number, id: number) {
        const item = await this.templateRepo.findOne({
            where: { id, hotelId },
            withDeleted: true,
        });
        if (!item) throw new NotFoundException(`TemplateCancellationRule #${id} not found`);
        return this.templateRepo.restore(id);
    }
}
