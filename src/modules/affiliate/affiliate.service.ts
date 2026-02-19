import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { Affiliate } from './entities/affiliate.entity';
import { CreateAffiliateDto } from './dto/create-affiliate.dto';
import { UpdateAffiliateDto } from './dto/update-affiliate.dto';

@Injectable()
export class AffiliateService {
    constructor(
        @InjectRepository(Affiliate)
        private readonly affiliateRepo: Repository<Affiliate>,
    ) { }

    async create(dto: CreateAffiliateDto): Promise<Affiliate> {
        const affiliate = this.affiliateRepo.create(dto);
        return this.affiliateRepo.save(affiliate);
    }

    async findAll(): Promise<Affiliate[]> {
        return this.affiliateRepo.find();
    }

    async findArchived(): Promise<Affiliate[]> {
        return this.affiliateRepo.find({
            withDeleted: true,
            where: { deletedAt: Not(IsNull()) },
        });
    }

    async update(id: number, dto: UpdateAffiliateDto): Promise<Affiliate> {
        const affiliate = await this.affiliateRepo.preload({ id, ...dto });
        if (!affiliate) {
            throw new NotFoundException(`Affiliate #${id} not found`);
        }
        return this.affiliateRepo.save(affiliate);
    }

    async remove(id: number): Promise<void> {
        const result = await this.affiliateRepo.softDelete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`Affiliate #${id} not found`);
        }
    }

    async restore(id: number): Promise<void> {
        const result = await this.affiliateRepo.restore(id);
        if (result.affected === 0) {
            throw new NotFoundException(`Affiliate #${id} not found or not archived`);
        }
    }
}
