import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, Like } from 'typeorm';
import { TemplateSpo } from './entities/template-spo.entity';
import { CreateTemplateSpoDto } from './dto/create-template-spo.dto';
import { UpdateTemplateSpoDto } from './dto/update-template-spo.dto';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';
import { PageDto } from '../../../common/dto/page.dto';
import { RequestUser } from '../../../common/interfaces/request.interface';
import { AuditService } from '../../../common/audit/audit.service';

@Injectable()
export class TemplateSpoService {
    /* istanbul ignore next */
    constructor(
        @InjectRepository(TemplateSpo)
        private readonly templateSpoRepo: Repository<TemplateSpo>,
        private readonly auditService: AuditService,
    ) { }

    async createTemplateSpo(hotelId: number, dto: CreateTemplateSpoDto, currentUser?: RequestUser): Promise<TemplateSpo> {
        const spo = this.templateSpoRepo.create({
            ...dto,
            hotelId,
        });
        const actor = await this.auditService.resolveActor(currentUser);
        this.auditService.applyCreateAudit(spo, actor);
        return this.templateSpoRepo.save(spo);
    }

    async findAllTemplateSpos(hotelId: number, pageOptions: PageOptionsDto): Promise<PageDto<TemplateSpo>> {
        const where: Record<string, unknown> = { hotelId };

        if (pageOptions.search) {
            where.name = Like(`%${pageOptions.search}%`);
        }

        const [data, total] = await this.templateSpoRepo.findAndCount({
            where,
            order: { id: 'DESC' },
            skip: pageOptions.skip,
            take: pageOptions.limit,
        });

        return new PageDto(data, total, pageOptions.page, pageOptions.limit);
    }

    async findArchivedTemplateSpos(hotelId: number): Promise<TemplateSpo[]> {
        return this.templateSpoRepo.find({
            withDeleted: true,
            where: { hotelId, deletedAt: Not(IsNull()) },
        });
    }

    async updateTemplateSpo(hotelId: number, id: number, dto: UpdateTemplateSpoDto, currentUser?: RequestUser): Promise<TemplateSpo> {
        const spo = await this.templateSpoRepo.findOne({ where: { id, hotelId } });
        if (!spo) {
            throw new NotFoundException(`TemplateSpo #${id} not found for this hotel`);
        }

        Object.assign(spo, dto);
        const actor = await this.auditService.resolveActor(currentUser);
        this.auditService.applyUpdateAudit(spo, actor);
        return this.templateSpoRepo.save(spo);
    }

    async removeTemplateSpo(hotelId: number, id: number): Promise<void> {
        const spo = await this.templateSpoRepo.findOne({ where: { id, hotelId } });
        if (!spo) {
            throw new NotFoundException(`TemplateSpo #${id} not found`);
        }
        await this.templateSpoRepo.softDelete(id);
    }

    async restoreTemplateSpo(hotelId: number, id: number): Promise<void> {
        const spo = await this.templateSpoRepo.findOne({
            where: { id, hotelId },
            withDeleted: true,
        });
        if (!spo) {
            throw new NotFoundException(`TemplateSpo #${id} not found`);
        }
        await this.templateSpoRepo.restore(id);
    }
}
