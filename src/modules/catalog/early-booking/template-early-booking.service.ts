import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, Like } from 'typeorm';
import { TemplateEarlyBooking } from './entities/template-early-booking.entity';
import { CreateTemplateEarlyBookingDto } from './dto/create-template-early-booking.dto';
import { UpdateTemplateEarlyBookingDto } from './dto/update-template-early-booking.dto';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';
import { PageDto } from '../../../common/dto/page.dto';
import { RequestUser } from '../../../common/interfaces/request.interface';
import { AuditService } from '../../../common/audit/audit.service';

@Injectable()
export class TemplateEarlyBookingService {
    /* istanbul ignore next */
    constructor(
        @InjectRepository(TemplateEarlyBooking)
        private readonly templateEarlyBookingRepo: Repository<TemplateEarlyBooking>,
        private readonly auditService: AuditService,
    ) { }

    async findAllTemplateEarlyBookings(
        hotelId: number,
        pageOptions: PageOptionsDto,
    ): Promise<PageDto<TemplateEarlyBooking>> {
        const where: Record<string, unknown> = { hotel: { id: hotelId } };

        if (pageOptions.search) {
            where.name = Like(`%${pageOptions.search}%`);
        }

        const [data, total] = await this.templateEarlyBookingRepo.findAndCount({
            where,
            order: { id: 'DESC' },
            skip: pageOptions.skip,
            take: pageOptions.limit,
        });

        return new PageDto(data, total, pageOptions.page, pageOptions.limit);
    }

    async findArchivedTemplateEarlyBookings(hotelId: number): Promise<TemplateEarlyBooking[]> {
        return this.templateEarlyBookingRepo.find({
            withDeleted: true,
            where: { hotel: { id: hotelId }, deletedAt: Not(IsNull()) },
            order: { id: 'DESC' },
        });
    }

    async createTemplateEarlyBooking(
        hotelId: number,
        dto: CreateTemplateEarlyBookingDto,
        currentUser?: RequestUser,
    ): Promise<TemplateEarlyBooking> {
        const eb = this.templateEarlyBookingRepo.create({
            ...dto,
            hotel: { id: hotelId },
        });
        const actor = await this.auditService.resolveActor(currentUser);
        this.auditService.applyCreateAudit(eb, actor);
        return this.templateEarlyBookingRepo.save(eb);
    }

    async updateTemplateEarlyBooking(
        hotelId: number,
        id: number,
        dto: UpdateTemplateEarlyBookingDto,
        currentUser?: RequestUser,
    ): Promise<TemplateEarlyBooking> {
        const eb = await this.templateEarlyBookingRepo.findOne({
            where: { id, hotel: { id: hotelId } },
        });
        if (!eb) {
            throw new NotFoundException(`Early Booking #${id} not found in hotel #${hotelId}`);
        }
        Object.assign(eb, dto);
        const actor = await this.auditService.resolveActor(currentUser);
        this.auditService.applyUpdateAudit(eb, actor);
        return this.templateEarlyBookingRepo.save(eb);
    }

    async removeTemplateEarlyBooking(hotelId: number, id: number): Promise<void> {
        const eb = await this.templateEarlyBookingRepo.findOne({
            where: { id, hotel: { id: hotelId } },
        });
        if (!eb) {
            throw new NotFoundException(`Early Booking #${id} not found in hotel #${hotelId}`);
        }
        await this.templateEarlyBookingRepo.softDelete(id);
    }

    async restoreTemplateEarlyBooking(hotelId: number, id: number): Promise<void> {
        const eb = await this.templateEarlyBookingRepo.findOne({
            where: { id, hotel: { id: hotelId } },
            withDeleted: true,
        });
        if (!eb) {
            throw new NotFoundException(`Early Booking #${id} not found in hotel #${hotelId}`);
        }
        await this.templateEarlyBookingRepo.restore(id);
    }
}
