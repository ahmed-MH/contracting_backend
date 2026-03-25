import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, Like } from 'typeorm';
import { TemplateMonoparentalRule } from './entities/template-monoparental-rule.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { CreateTemplateMonoparentalRuleDto } from './dto/create-template-monoparental-rule.dto';
import { UpdateTemplateMonoparentalRuleDto } from './dto/update-template-monoparental-rule.dto';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';
import { PageDto } from '../../../common/dto/page.dto';

@Injectable()
export class TemplateMonoparentalRuleService {
    /* istanbul ignore next */
    constructor(
        @InjectRepository(TemplateMonoparentalRule)
        private readonly templateMonoparentalRuleRepo: Repository<TemplateMonoparentalRule>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
    ) { }

    async findAllTemplateMonoparentalRules(
        hotelId: number,
        pageOptions: PageOptionsDto,
    ): Promise<PageDto<TemplateMonoparentalRule>> {
        const where: Record<string, unknown> = { hotelId };

        if (pageOptions.search) {
            where.name = Like(`%${pageOptions.search}%`);
        }

        const [data, total] = await this.templateMonoparentalRuleRepo.findAndCount({
            where,
            order: { id: 'DESC' },
            skip: pageOptions.skip,
            take: pageOptions.limit,
        });

        return new PageDto(data, total, pageOptions.page, pageOptions.limit);
    }

    async findArchivedTemplateMonoparentalRules(hotelId: number): Promise<TemplateMonoparentalRule[]> {
        return this.templateMonoparentalRuleRepo.find({
            withDeleted: true,
            where: { hotelId, deletedAt: Not(IsNull()) },
        });
    }

    async createTemplateMonoparentalRule(
        hotelId: number,
        dto: CreateTemplateMonoparentalRuleDto,
    ): Promise<TemplateMonoparentalRule> {
        const hotel = await this.hotelRepo.findOne({ where: { id: hotelId } });
        if (!hotel) {
            throw new NotFoundException(`Hotel #${hotelId} not found`);
        }
        const rule = this.templateMonoparentalRuleRepo.create({ ...dto, hotel });
        return this.templateMonoparentalRuleRepo.save(rule);
    }

    async updateTemplateMonoparentalRule(
        hotelId: number,
        id: number,
        dto: UpdateTemplateMonoparentalRuleDto,
    ): Promise<TemplateMonoparentalRule> {
        const rule = await this.templateMonoparentalRuleRepo.findOne({
            where: { id, hotelId },
        });
        if (!rule) {
            throw new NotFoundException(`TemplateMonoparentalRule #${id} not found in hotel #${hotelId}`);
        }
        Object.assign(rule, dto);
        return this.templateMonoparentalRuleRepo.save(rule);
    }

    async removeTemplateMonoparentalRule(hotelId: number, id: number): Promise<void> {
        const rule = await this.templateMonoparentalRuleRepo.findOne({
            where: { id, hotelId },
        });
        if (!rule) {
            throw new NotFoundException(`TemplateMonoparentalRule #${id} not found in hotel #${hotelId}`);
        }
        await this.templateMonoparentalRuleRepo.softDelete(id);
    }

    async restoreTemplateMonoparentalRule(hotelId: number, id: number): Promise<void> {
        const rule = await this.templateMonoparentalRuleRepo.findOne({
            where: { id, hotelId },
            withDeleted: true,
        });
        if (!rule) {
            throw new NotFoundException(`TemplateMonoparentalRule #${id} not found in hotel #${hotelId}`);
        }
        await this.templateMonoparentalRuleRepo.restore(id);
    }
}
