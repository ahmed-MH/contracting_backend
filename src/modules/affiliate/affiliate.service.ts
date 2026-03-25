import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { Affiliate } from './entities/affiliate.entity';
import { Contract } from '../contract/core/entities/contract.entity';
import { CreateAffiliateDto } from './dto/create-affiliate.dto';
import { UpdateAffiliateDto } from './dto/update-affiliate.dto';

@Injectable()
export class AffiliateService {
    /* istanbul ignore next */
    constructor(
        @InjectRepository(Affiliate)
        private readonly affiliateRepo: Repository<Affiliate>,
    ) { }

    async create(hotelId: number, dto: CreateAffiliateDto): Promise<Affiliate> {
        const affiliate = this.affiliateRepo.create({ ...dto, hotelId });
        return this.affiliateRepo.save(affiliate);
    }

    async findAll(hotelId: number): Promise<Affiliate[]> {
        return this.affiliateRepo.find({ where: { hotelId } });
    }

    async findArchived(hotelId: number): Promise<Affiliate[]> {
        return this.affiliateRepo.find({
            withDeleted: true,
            where: { hotelId, deletedAt: Not(IsNull()) },
        });
    }

    async getContractsForAffiliate(hotelId: number, affiliateId: number): Promise<Contract[]> {
        const affiliate = await this.affiliateRepo.findOne({
            where: { id: affiliateId, hotelId },
            relations: ['contracts'],
        });
        if (!affiliate) {
            throw new NotFoundException(`Affiliate #${affiliateId} not found`);
        }
        return affiliate.contracts ?? [];
    }

    async update(hotelId: number, id: number, dto: UpdateAffiliateDto): Promise<Affiliate> {
        const affiliate = await this.affiliateRepo.preload({ id, ...dto });
        if (!affiliate || affiliate.hotelId !== hotelId) {
            throw new NotFoundException(`Affiliate #${id} not found`);
        }
        return this.affiliateRepo.save(affiliate);
    }

    async remove(hotelId: number, id: number): Promise<void> {
        const affiliate = await this.affiliateRepo.findOne({ where: { id, hotelId } });
        if (!affiliate) {
            throw new NotFoundException(`Affiliate #${id} not found`);
        }
        const result = await this.affiliateRepo.softDelete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`Affiliate #${id} not found`);
        }
    }

    async restore(hotelId: number, id: number): Promise<void> {
        const affiliate = await this.affiliateRepo.findOne({ where: { id, hotelId }, withDeleted: true });
        if (!affiliate) {
            throw new NotFoundException(`Affiliate #${id} not found or not archived`);
        }
        const result = await this.affiliateRepo.restore(id);
        if (result.affected === 0) {
            throw new NotFoundException(`Affiliate #${id} not found or not archived`);
        }
    }
}
