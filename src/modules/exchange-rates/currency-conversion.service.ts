import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Hotel } from '../hotel/entities/hotel.entity';
import { ExchangeRate } from './entities/exchange-rate.entity';

export type CurrencyConversionType = 'identity' | 'direct' | 'inverse' | 'cross' | 'unresolved';

export interface CurrencyConversionRatePair {
    id?: number;
    key: string;
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    effectiveDate: string;
}

export interface CurrencyRateResolution {
    hotelId: number;
    sourceCurrency: string;
    targetCurrency: string;
    type: CurrencyConversionType;
    rate: number | null;
    rateDate: string | null;
    pivotCurrency?: string;
    pairsUsed: CurrencyConversionRatePair[];
    missingRateReason?: string;
}

export interface CurrencyConversionResult extends CurrencyRateResolution {
    amount: number;
    convertedAmount: number | null;
}

export interface CurrencyConversionOptions {
    pivotCurrency?: string | null;
}

interface ResolvedConversionLeg {
    rate: number;
    rateDate: string;
    pairsUsed: CurrencyConversionRatePair[];
}

@Injectable()
export class CurrencyConversionService {
    constructor(
        @InjectRepository(ExchangeRate)
        private readonly exchangeRateRepo: Repository<ExchangeRate>,
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
    ) {}

    async resolveRate(
        fromCurrency: string,
        toCurrency: string,
        hotelId: number,
        asOfDate?: Date | string | null,
        options: CurrencyConversionOptions = {},
    ): Promise<CurrencyRateResolution> {
        const sourceCurrency = this.normalizeCurrency(fromCurrency);
        const targetCurrency = this.normalizeCurrency(toCurrency);
        const effectiveAsOfDate = this.toDate(asOfDate) ?? new Date();
        const fallbackRateDate = this.isoDate(effectiveAsOfDate);

        if (!sourceCurrency || !targetCurrency) {
            return this.unresolved(
                hotelId,
                sourceCurrency,
                targetCurrency,
                'Source and target currencies are required.',
            );
        }

        if (sourceCurrency === targetCurrency) {
            return {
                hotelId,
                sourceCurrency,
                targetCurrency,
                type: 'identity',
                rate: 1,
                rateDate: fallbackRateDate,
                pairsUsed: [],
            };
        }

        const pivotCurrency = await this.resolvePivotCurrency(hotelId, sourceCurrency, options.pivotCurrency);
        const rates = await this.loadRates(hotelId);

        const direct = this.selectPair(rates, sourceCurrency, targetCurrency, pivotCurrency, effectiveAsOfDate);
        if (direct) {
            return {
                hotelId,
                sourceCurrency,
                targetCurrency,
                type: 'direct',
                rate: direct.rate,
                rateDate: direct.effectiveDate,
                pairsUsed: [direct],
            };
        }

        const inverse = this.selectPair(rates, targetCurrency, sourceCurrency, pivotCurrency, effectiveAsOfDate);
        if (inverse) {
            return {
                hotelId,
                sourceCurrency,
                targetCurrency,
                type: 'inverse',
                rate: 1 / inverse.rate,
                rateDate: inverse.effectiveDate,
                pairsUsed: [inverse],
            };
        }

        if (pivotCurrency && pivotCurrency !== sourceCurrency && pivotCurrency !== targetCurrency) {
            const sourceToPivot = this.resolveLeg(rates, sourceCurrency, pivotCurrency, pivotCurrency, effectiveAsOfDate);
            const pivotToTarget = this.resolveLeg(rates, pivotCurrency, targetCurrency, pivotCurrency, effectiveAsOfDate);

            if (sourceToPivot && pivotToTarget) {
                return {
                    hotelId,
                    sourceCurrency,
                    targetCurrency,
                    type: 'cross',
                    rate: sourceToPivot.rate * pivotToTarget.rate,
                    rateDate: pivotToTarget.rateDate,
                    pivotCurrency,
                    pairsUsed: [...sourceToPivot.pairsUsed, ...pivotToTarget.pairsUsed],
                };
            }
        }

        return this.unresolved(
            hotelId,
            sourceCurrency,
            targetCurrency,
            `No exchange rate is available for ${sourceCurrency} to ${targetCurrency}.`,
            pivotCurrency,
        );
    }

    async convertAmount(
        amount: number | string | null | undefined,
        fromCurrency: string,
        toCurrency: string,
        hotelId: number,
        asOfDate?: Date | string | null,
        options: CurrencyConversionOptions = {},
    ): Promise<CurrencyConversionResult> {
        const numericAmount = Number(amount ?? 0);
        const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
        const resolution = await this.resolveRate(fromCurrency, toCurrency, hotelId, asOfDate, options);

        return {
            ...resolution,
            amount: safeAmount,
            convertedAmount: resolution.rate != null ? safeAmount * resolution.rate : null,
        };
    }

    private async loadRates(hotelId: number): Promise<ExchangeRate[]> {
        return this.exchangeRateRepo.find({
            where: { hotelId },
            order: { effectiveDate: 'DESC', createdAt: 'DESC' },
        });
    }

    private async resolvePivotCurrency(hotelId: number, sourceCurrency: string, requestedPivot?: string | null): Promise<string> {
        const normalizedRequestedPivot = this.normalizeCurrency(requestedPivot);
        if (normalizedRequestedPivot) return normalizedRequestedPivot;

        const hotel = await this.hotelRepo.findOne({
            where: { id: hotelId },
            select: { id: true, defaultCurrency: true } as any,
        });

        return this.normalizeCurrency(hotel?.defaultCurrency) || sourceCurrency;
    }

    private resolveLeg(
        rates: ExchangeRate[],
        fromCurrency: string,
        toCurrency: string,
        quoteCurrency: string,
        asOfDate: Date,
    ): ResolvedConversionLeg | null {
        const direct = this.selectPair(rates, fromCurrency, toCurrency, quoteCurrency, asOfDate);
        if (direct) {
            return {
                rate: direct.rate,
                rateDate: direct.effectiveDate,
                pairsUsed: [direct],
            };
        }

        const inverse = this.selectPair(rates, toCurrency, fromCurrency, quoteCurrency, asOfDate);
        if (inverse) {
            return {
                rate: 1 / inverse.rate,
                rateDate: inverse.effectiveDate,
                pairsUsed: [inverse],
            };
        }

        return null;
    }

    private selectPair(
        rates: ExchangeRate[],
        fromCurrency: string,
        toCurrency: string,
        quoteCurrency: string,
        asOfDate: Date,
    ): CurrencyConversionRatePair | null {
        const from = this.normalizeCurrency(fromCurrency);
        const to = this.normalizeCurrency(toCurrency);
        const matching = rates
            .map((rate) => this.toPair(rate, quoteCurrency))
            .filter((pair): pair is CurrencyConversionRatePair => Boolean(pair))
            .filter((pair) => pair.fromCurrency === from && pair.toCurrency === to)
            .sort((a, b) => this.comparePairsByRecency(a, b));

        const selected = matching.find((pair) => this.rateAppliesOn(pair, asOfDate)) ?? matching[0] ?? null;
        return selected;
    }

    private toPair(rate: ExchangeRate, quoteCurrency: string): CurrencyConversionRatePair | null {
        const fromCurrency = this.normalizeCurrency(rate.fromCurrency ?? rate.currency);
        const toCurrency = this.normalizeCurrency(rate.toCurrency ?? quoteCurrency);
        const value = Number(rate.rate);

        if (!fromCurrency || !toCurrency || !Number.isFinite(value) || value <= 0) {
            return null;
        }

        return {
            id: rate.id,
            key: this.exchangeRatePairKey(fromCurrency, toCurrency),
            fromCurrency,
            toCurrency,
            rate: value,
            effectiveDate: this.isoDate(this.rateEffectiveDate(rate)),
        };
    }

    private rateAppliesOn(pair: CurrencyConversionRatePair, asOfDate: Date): boolean {
        const effectiveDate = this.toDate(pair.effectiveDate);
        if (!effectiveDate) return false;
        return effectiveDate.getTime() <= asOfDate.getTime();
    }

    private comparePairsByRecency(a: CurrencyConversionRatePair, b: CurrencyConversionRatePair): number {
        const dateDiff = (this.toDate(b.effectiveDate)?.getTime() ?? 0) - (this.toDate(a.effectiveDate)?.getTime() ?? 0);
        if (dateDiff !== 0) return dateDiff;
        return (b.id ?? 0) - (a.id ?? 0);
    }

    private rateEffectiveDate(rate: ExchangeRate): Date | string | null | undefined {
        return rate.effectiveDate ?? rate.validFrom;
    }

    private unresolved(
        hotelId: number,
        sourceCurrency: string,
        targetCurrency: string,
        missingRateReason: string,
        pivotCurrency?: string,
    ): CurrencyRateResolution {
        return {
            hotelId,
            sourceCurrency,
            targetCurrency,
            type: 'unresolved',
            rate: null,
            rateDate: null,
            pivotCurrency,
            pairsUsed: [],
            missingRateReason,
        };
    }

    private exchangeRatePairKey(fromCurrency: string, toCurrency: string): string {
        return `${this.normalizeCurrency(fromCurrency)}_${this.normalizeCurrency(toCurrency)}`;
    }

    private normalizeCurrency(currency?: string | null): string {
        return (currency || '').trim().toUpperCase();
    }

    private toDate(value?: Date | string | null): Date | null {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    private isoDate(value?: Date | string | null): string {
        const date = this.toDate(value) ?? new Date();
        return date.toISOString().slice(0, 10);
    }
}
