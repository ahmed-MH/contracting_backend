import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ExchangeRate, ExchangeRateSource } from './entities/exchange-rate.entity';
import { Hotel } from '../hotel/entities/hotel.entity';
import { CreateExchangeRateDto, UpdateExchangeRateDto } from './dto/exchange-rate.dto';

@Injectable()
export class ExchangeRateService {
    /* istanbul ignore next */
    constructor(
        @InjectRepository(ExchangeRate)
        private readonly exchangeRateRepo: Repository<ExchangeRate>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
    ) {}

    async create(hotelId: number, createDto: CreateExchangeRateDto, updatedBy?: string | null): Promise<ExchangeRate> {
        const hotel = await this.hotelRepo.findOneBy({ id: hotelId });
        if (!hotel) throw new NotFoundException('Hotel introuvable');

        const fromCurrency = this.normalizeCurrency(createDto.fromCurrency);
        const toCurrency = this.normalizeCurrency(createDto.toCurrency);
        this.assertValidPair(fromCurrency, toCurrency, createDto.rate);
        const effectiveDate = this.toEffectiveDate(createDto.effectiveDate);

        await this.assertNoDuplicate(hotelId, fromCurrency, toCurrency, effectiveDate);

        const rate = this.exchangeRateRepo.create({
            fromCurrency,
            toCurrency,
            rate: createDto.rate,
            hotelId,
            effectiveDate,
            source: createDto.source ?? ExchangeRateSource.MANUAL,
            updatedBy: updatedBy ?? null,
        } as Partial<ExchangeRate>);

        return this.exchangeRateRepo.save(rate);
    }

    async findAll(hotelId: number): Promise<ExchangeRate[]> {
        const [hotel, rates] = await Promise.all([
            this.hotelRepo.findOneBy({ id: hotelId }),
            this.exchangeRateRepo.find({
            where: { hotelId },
            order: { effectiveDate: 'DESC', createdAt: 'DESC' },
            }),
        ]);

        return rates.map((rate) => this.hydrateLegacyRate(rate, hotel?.defaultCurrency));
    }

    async findOne(hotelId: number, id: number): Promise<ExchangeRate> {
        const rate = await this.exchangeRateRepo.findOneBy({ id, hotelId });
        if (!rate) throw new NotFoundException('Taux de change introuvable pour cet hotel');
        const hotel = await this.hotelRepo.findOneBy({ id: hotelId });
        return this.hydrateLegacyRate(rate, hotel?.defaultCurrency);
    }

    async update(hotelId: number, id: number, updateDto: UpdateExchangeRateDto, updatedBy?: string | null): Promise<ExchangeRate> {
        const rate = await this.findOne(hotelId, id);

        const fromCurrency = this.normalizeCurrency(updateDto.fromCurrency ?? rate.fromCurrency);
        const toCurrency = this.normalizeCurrency(updateDto.toCurrency ?? rate.toCurrency);
        const nextRate = updateDto.rate ?? rate.rate;
        const effectiveDate = updateDto.effectiveDate ? this.toEffectiveDate(updateDto.effectiveDate) : rate.effectiveDate;

        this.assertValidPair(fromCurrency, toCurrency, nextRate);
        await this.assertNoDuplicate(hotelId, fromCurrency, toCurrency, effectiveDate, id);

        rate.fromCurrency = fromCurrency;
        rate.toCurrency = toCurrency;
        rate.rate = nextRate;
        rate.effectiveDate = effectiveDate;
        if (updateDto.source) rate.source = updateDto.source;
        rate.updatedBy = updatedBy ?? rate.updatedBy ?? null;

        return this.exchangeRateRepo.save(rate);
    }

    async remove(hotelId: number, id: number): Promise<void> {
        const rate = await this.findOne(hotelId, id);
        await this.exchangeRateRepo.remove(rate);
    }

    private normalizeCurrency(currency: string): string {
        return currency.trim().toUpperCase();
    }

    private hydrateLegacyRate(rate: ExchangeRate, hotelCurrency?: string | null): ExchangeRate {
        if (!rate.fromCurrency && rate.currency) {
            rate.fromCurrency = this.normalizeCurrency(rate.currency);
        }
        if (!rate.toCurrency && hotelCurrency) {
            rate.toCurrency = this.normalizeCurrency(hotelCurrency);
        }
        if (!rate.effectiveDate && rate.validFrom) {
            rate.effectiveDate = rate.validFrom;
        }
        if (!rate.source) {
            rate.source = ExchangeRateSource.MANUAL;
        }
        return rate;
    }

    private toEffectiveDate(value: string): Date {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            throw new BadRequestException('Effective date is invalid.');
        }
        return date;
    }

    private assertValidPair(fromCurrency: string, toCurrency: string, rate: number): void {
        if (fromCurrency === toCurrency) {
            throw new BadRequestException('From currency and to currency must be different.');
        }
        if (!Number.isFinite(Number(rate)) || Number(rate) <= 0) {
            throw new BadRequestException('Exchange rate must be a positive number.');
        }
    }

    private async assertNoDuplicate(
        hotelId: number,
        fromCurrency: string,
        toCurrency: string,
        effectiveDate: Date,
        excludeId?: number,
    ): Promise<void> {
        const existing = await this.exchangeRateRepo.findOne({
            where: {
                hotelId,
                fromCurrency,
                toCurrency,
                effectiveDate,
                ...(excludeId ? { id: Not(excludeId) } : {}),
            } as any,
        });

        if (existing) {
            throw new BadRequestException('An exchange rate already exists for this currency pair and effective date.');
        }
    }
}
