import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { Hotel } from './entities/hotel.entity';
import { CreateExchangeRateDto, UpdateExchangeRateDto } from './dto/exchange-rate.dto';

@Injectable()
export class ExchangeRateService {
    constructor(
        @InjectRepository(ExchangeRate)
        private readonly exchangeRateRepo: Repository<ExchangeRate>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
    ) {}

    async create(hotelId: number, createDto: CreateExchangeRateDto): Promise<ExchangeRate> {
        const hotel = await this.hotelRepo.findOneBy({ id: hotelId });
        if (!hotel) throw new NotFoundException('Hotel introuvable');

        const rate = this.exchangeRateRepo.create({
            currency: createDto.currency,
            rate: createDto.rate,
            hotelId,
            validFrom: new Date(createDto.validFrom),
            validUntil: createDto.validUntil ? new Date(createDto.validUntil) : null,
        } as Partial<ExchangeRate>);

        return this.exchangeRateRepo.save(rate);
    }

    async findAll(hotelId: number): Promise<ExchangeRate[]> {
        return this.exchangeRateRepo.find({
            where: { hotelId },
            order: { validFrom: 'DESC', createdAt: 'DESC' },
        });
    }

    async findOne(hotelId: number, id: number): Promise<ExchangeRate> {
        const rate = await this.exchangeRateRepo.findOneBy({ id, hotelId });
        if (!rate) throw new NotFoundException('Taux de change introuvable pour cet hôtel');
        return rate;
    }

    async update(hotelId: number, id: number, updateDto: UpdateExchangeRateDto): Promise<ExchangeRate> {
        const rate = await this.findOne(hotelId, id);
        
        if (updateDto.validFrom) rate.validFrom = new Date(updateDto.validFrom);
        if (updateDto.validUntil) rate.validUntil = new Date(updateDto.validUntil);
        else if (updateDto.validUntil === null) rate.validUntil = null as any;
        
        if (updateDto.currency) rate.currency = updateDto.currency;
        if (updateDto.rate !== undefined) rate.rate = updateDto.rate;

        return this.exchangeRateRepo.save(rate);
    }

    async remove(hotelId: number, id: number): Promise<void> {
        const rate = await this.findOne(hotelId, id);
        await this.exchangeRateRepo.remove(rate);
    }
}
