import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { AuditService } from '../../../common/audit/audit.service';
import { RequestUser } from '../../../common/interfaces/request.interface';
import {
    AffiliateEmailSpoApplicationStep,
    AffiliateEmailSpoStackMode,
    AffiliateEmailSpoStatus,
} from '../../../common/constants/enums';
import { Affiliate } from '../entities/affiliate.entity';
import { AffiliateEmailSpo } from './entities/affiliate-email-spo.entity';
import { CreateAffiliateEmailSpoDto } from './dto/create-affiliate-email-spo.dto';
import { UpdateAffiliateEmailSpoDto } from './dto/update-affiliate-email-spo.dto';

@Injectable()
export class AffiliateEmailSpoService {
    constructor(
        @InjectRepository(Affiliate)
        private readonly affiliateRepo: Repository<Affiliate>,
        @InjectRepository(AffiliateEmailSpo)
        private readonly affiliateEmailSpoRepo: Repository<AffiliateEmailSpo>,
        private readonly auditService: AuditService,
    ) {}

    async findAll(hotelId: number, affiliateId: number): Promise<AffiliateEmailSpo[]> {
        await this.loadAffiliateOrFail(hotelId, affiliateId);
        return this.affiliateEmailSpoRepo.find({
            where: { hotelId, affiliateId },
            order: { applicationFrom: 'DESC', id: 'DESC' },
        });
    }

    async create(
        hotelId: number,
        affiliateId: number,
        dto: CreateAffiliateEmailSpoDto,
        currentUser?: RequestUser,
    ): Promise<AffiliateEmailSpo> {
        await this.loadAffiliateOrFail(hotelId, affiliateId);
        this.assertDateRange(dto.applicationFrom, dto.applicationTo);

        const status = dto.status ?? AffiliateEmailSpoStatus.ACTIVE;
        await this.assertNoActiveOverlap(hotelId, affiliateId, dto.applicationFrom, dto.applicationTo, status);

        const actor = await this.auditService.resolveActor(currentUser);
        const entity = this.affiliateEmailSpoRepo.create({
            hotelId,
            affiliateId,
            name: dto.name?.trim(),
            description: dto.description?.trim() || null,
            discountPercent: dto.discountPercent,
            applicationFrom: dto.applicationFrom as any,
            applicationTo: dto.applicationTo as any,
            stackMode: dto.stackMode ?? AffiliateEmailSpoStackMode.ROLLING,
            applicationStep: dto.applicationStep ?? AffiliateEmailSpoApplicationStep.AFTER_CONTRACT_SPO,
            status,
        });

        this.auditService.applyCreateAudit(entity, actor);
        return this.affiliateEmailSpoRepo.save(entity);
    }

    async update(
        hotelId: number,
        affiliateId: number,
        emailSpoId: number,
        dto: UpdateAffiliateEmailSpoDto,
        currentUser?: RequestUser,
    ): Promise<AffiliateEmailSpo> {
        await this.loadAffiliateOrFail(hotelId, affiliateId);
        const existing = await this.loadEmailSpoOrFail(hotelId, affiliateId, emailSpoId);

        const applicationFrom = dto.applicationFrom ?? this.dateOnly(existing.applicationFrom);
        const applicationTo = dto.applicationTo ?? this.dateOnly(existing.applicationTo);
        const status = dto.status ?? existing.status;

        this.assertDateRange(applicationFrom, applicationTo);
        await this.assertNoActiveOverlap(hotelId, affiliateId, applicationFrom, applicationTo, status, emailSpoId);

        existing.name = dto.name?.trim() ?? existing.name;
        existing.description = dto.description !== undefined ? (dto.description?.trim() || null) : existing.description;
        existing.discountPercent = dto.discountPercent ?? existing.discountPercent;
        existing.applicationFrom = applicationFrom as any;
        existing.applicationTo = applicationTo as any;
        existing.stackMode = dto.stackMode ?? existing.stackMode;
        existing.applicationStep = dto.applicationStep ?? existing.applicationStep;
        existing.status = status;

        const actor = await this.auditService.resolveActor(currentUser);
        this.auditService.applyUpdateAudit(existing, actor);
        return this.affiliateEmailSpoRepo.save(existing);
    }

    async remove(hotelId: number, affiliateId: number, emailSpoId: number): Promise<void> {
        await this.loadAffiliateOrFail(hotelId, affiliateId);
        const emailSpo = await this.loadEmailSpoOrFail(hotelId, affiliateId, emailSpoId);
        const result = await this.affiliateEmailSpoRepo.delete(emailSpo.id);

        if (result.affected === 0) {
            throw new NotFoundException(`Email SPO #${emailSpoId} not found`);
        }
    }

    private async loadAffiliateOrFail(hotelId: number, affiliateId: number): Promise<Affiliate> {
        const affiliate = await this.affiliateRepo.findOne({
            where: { id: affiliateId, hotelId },
        });

        if (!affiliate) {
            throw new NotFoundException(`Affiliate #${affiliateId} not found`);
        }

        return affiliate;
    }

    private async loadEmailSpoOrFail(hotelId: number, affiliateId: number, emailSpoId: number): Promise<AffiliateEmailSpo> {
        const emailSpo = await this.affiliateEmailSpoRepo.findOne({
            where: { id: emailSpoId, hotelId, affiliateId },
        });

        if (!emailSpo) {
            throw new NotFoundException(`Email SPO #${emailSpoId} not found`);
        }

        return emailSpo;
    }

    private async assertNoActiveOverlap(
        hotelId: number,
        affiliateId: number,
        applicationFrom: string,
        applicationTo: string,
        status: AffiliateEmailSpoStatus,
        currentId?: number,
    ): Promise<void> {
        if (status !== AffiliateEmailSpoStatus.ACTIVE) {
            return;
        }

        const overlapping = await this.affiliateEmailSpoRepo.findOne({
            where: {
                hotelId,
                affiliateId,
                status: AffiliateEmailSpoStatus.ACTIVE,
                applicationFrom: LessThanOrEqual(applicationTo as any),
                applicationTo: MoreThanOrEqual(applicationFrom as any),
            },
            order: { applicationFrom: 'DESC', id: 'DESC' },
        });

        if (overlapping && overlapping.id !== currentId) {
            throw new BadRequestException(
                `An active Email SPO already overlaps this stay period for affiliate #${affiliateId}.`,
            );
        }
    }

    private assertDateRange(applicationFrom: string, applicationTo: string): void {
        if (applicationFrom > applicationTo) {
            throw new BadRequestException('applicationFrom must be before or equal to applicationTo');
        }
    }

    private dateOnly(value: Date | string): string {
        return new Date(value).toISOString().slice(0, 10);
    }
}
