import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ContractLine } from '../contract/core/entities/contract-line.entity';
import { Price } from '../contract/core/entities/price.entity';
import { Promotion } from '../contract/core/entities/promotion.entity';
import { Period } from '../contract/core/entities/period.entity';
import { ContractRoom } from '../contract/core/entities/contract-room.entity';
import { Arrangement } from '../hotel/entities/arrangement.entity';
import { InitContractLineDto } from './dto/init-contract-line.dto';
import { SetPriceDto } from './dto/set-price.dto';
import { ManageLinePromosDto } from './dto/manage-line-promos.dto';
import { SetAllotmentDto } from './dto/set-allotment.dto';

@Injectable()
export class PricingService {
    /* istanbul ignore next */
    constructor(
        @InjectRepository(ContractLine)
        private readonly lineRepo: Repository<ContractLine>,

        @InjectRepository(Price)
        private readonly priceRepo: Repository<Price>,

        @InjectRepository(Promotion)
        private readonly promotionRepo: Repository<Promotion>,

        @InjectRepository(Period)
        private readonly periodRepo: Repository<Period>,

        @InjectRepository(ContractRoom)
        private readonly contractRoomRepo: Repository<ContractRoom>,

        @InjectRepository(Arrangement)
        private readonly arrangementRepo: Repository<Arrangement>,
    ) { }

    // ─── Initialize a Contract Line (Period × Room intersection) ──────

    async initContractLine(hotelId: number, dto: InitContractLineDto): Promise<ContractLine> {
        // Idempotent: return existing line if already created
        const existing = await this.lineRepo.findOne({
            where: {
                period: { id: dto.periodId, contract: { hotelId } },
                contractRoom: { id: dto.contractRoomId },
            },
            relations: ['period', 'contractRoom'],
        });

        if (existing) {
            return existing;
        }

        const period = await this.periodRepo.findOne({
            where: { id: dto.periodId, contract: { hotelId } },
            relations: ['contract'],
        });
        if (!period) {
            throw new NotFoundException(`Period #${dto.periodId} not found or does not belong to hotel #${hotelId}`);
        }

        // Verify the period belongs to the correct contract
        if (period.contract.id !== dto.contractId) {
            throw new BadRequestException(
                `Period #${dto.periodId} does not belong to Contract #${dto.contractId}`,
            );
        }

        const contractRoom = await this.contractRoomRepo.findOne({
            where: { id: dto.contractRoomId, contract: { hotelId } },
            relations: ['contract'],
        });
        if (!contractRoom) {
            throw new NotFoundException(`ContractRoom #${dto.contractRoomId} not found or does not belong to hotel #${hotelId}`);
        }

        if (contractRoom.contract.id !== dto.contractId) {
            throw new BadRequestException(
                `ContractRoom #${dto.contractRoomId} does not belong to Contract #${dto.contractId}`,
            );
        }

        const line = this.lineRepo.create({ period, contractRoom });
        return this.lineRepo.save(line);
    }

    // ─── Set / Update a Price (upsert by line + arrangement) ──────────

    async setPrice(hotelId: number, dto: SetPriceDto): Promise<Price> {
        const line = await this.lineRepo.findOne({
            where: { id: dto.contractLineId, period: { contract: { hotelId } } }
        });
        if (!line) {
            throw new NotFoundException(`ContractLine #${dto.contractLineId} not found or does not belong to hotel #${hotelId}`);
        }

        const arrangement = await this.arrangementRepo.findOne({
            where: { id: dto.arrangementId, hotelId },
        });
        if (!arrangement) {
            throw new NotFoundException(`Arrangement #${dto.arrangementId} not found in hotel #${hotelId}`);
        }

        // Upsert: update existing or create new
        let price = await this.priceRepo.findOne({
            where: {
                contractLine: { id: dto.contractLineId },
                arrangement: { id: dto.arrangementId },
            },
        });

        if (price) {
            price.amount = dto.amount;
        } else {
            price = this.priceRepo.create({
                contractLine: line,
                arrangement,
                amount: dto.amount,
                currency: 'TND',
                minStay: 1,
                releaseDays: 0,
            });
        }

        return this.priceRepo.save(price);
    }

    // ─── Manage Promotions on a Line (full replacement) ───────────────

    async setLinePromotions(hotelId: number, dto: ManageLinePromosDto): Promise<ContractLine> {
        const line = await this.lineRepo.findOne({
            where: { id: dto.contractLineId, period: { contract: { hotelId } } },
            relations: ['promotions'],
        });

        if (!line) {
            throw new NotFoundException(`ContractLine #${dto.contractLineId} not found or does not belong to hotel #${hotelId}`);
        }

        const promotions = await this.promotionRepo.find({
            where: { id: In(dto.promotionIds) },
        });

        if (promotions.length !== dto.promotionIds.length) {
            const foundIds = promotions.map((p) => p.id);
            const missing = dto.promotionIds.filter((id) => !foundIds.includes(id));
            throw new NotFoundException(`Promotions not found: ${missing.join(', ')}`);
        }

        // Full replacement of the ManyToMany relation
        line.promotions = promotions;
        return this.lineRepo.save(line);
    }

    // ─── Set / Update Allotment (now stored as a column on ContractLine) ─────

    async setAllotment(hotelId: number, dto: SetAllotmentDto): Promise<ContractLine> {
        const line = await this.lineRepo.findOne({
            where: { id: dto.contractLineId, period: { contract: { hotelId } } },
        });

        if (!line) {
            throw new NotFoundException(`ContractLine #${dto.contractLineId} not found or does not belong to hotel #${hotelId}`);
        }

        line.allotment = dto.quantity;
        return this.lineRepo.save(line);
    }

    // ─── Get full pricing matrix for a contract ───────────────────────

    async getMatrix(hotelId: number, contractId: number): Promise<ContractLine[]> {
        const lines = await this.lineRepo.find({
            where: {
                period: { contract: { id: contractId, hotelId } },
            },
            relations: [
                'period',
                'contractRoom',
                'contractRoom.roomType',
                'prices',
                'prices.arrangement',
                'promotions',
                'childPolicies',
            ],
            order: {
                period: { startDate: 'ASC' },
            },
        });

        if (lines.length === 0) {
            throw new NotFoundException(
                `No contract lines found for Contract #${contractId}`,
            );
        }

        return lines;
    }
}
