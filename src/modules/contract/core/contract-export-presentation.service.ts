import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRate } from '../../exchange-rates/entities/exchange-rate.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { Contract } from './entities/contract.entity';
import { ContractLine } from './entities/contract-line.entity';
import { ContractSupplement } from '../supplement/entities/contract-supplement.entity';
import { ContractReduction } from '../reduction/entities/contract-reduction.entity';
import { ContractEarlyBooking } from '../early-booking/entities/contract-early-booking.entity';
import { ContractSpo } from '../spo/entities/contract-spo.entity';
import { ContractCancellationRule } from '../cancellation/entities/contract-cancellation-rule.entity';
import { ContractPdfGeneratorModel } from './contract-pdf.generator';

export type ContractExportLanguage = 'fr' | 'en';

export interface ContractExportFxContext {
    sourceCurrency: string;
    outputCurrency: string;
    rate: number;
    rateDate: string;
    source: 'BASE_CURRENCY' | 'EXCHANGE_RATE_TABLE';
    valuesUsed: Record<string, number>;
}

export interface ContractExportPresentationContext {
    language: ContractExportLanguage;
    sourceCurrency: string;
    outputCurrency: string;
    fx: ContractExportFxContext;
}

const CURRENCY_DECIMALS: Record<string, number> = {
    JPY: 0,
    TND: 3,
};

function normalizeCurrency(currency?: string | null): string {
    return (currency || '').trim().toUpperCase();
}

function isoDate(value?: Date | string | null): string {
    if (!value) return new Date().toISOString().slice(0, 10);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function rateAppliesOn(rate: ExchangeRate, date: Date): boolean {
    const effectiveDate = new Date(rateEffectiveDate(rate) ?? 0);
    if (Number.isNaN(effectiveDate.getTime())) return false;
    if (effectiveDate.getTime() > date.getTime()) return false;
    return true;
}

function exchangeRatePairKey(from: string, to: string): string {
    return `${normalizeCurrency(from)}_${normalizeCurrency(to)}`;
}

function rateFromCurrency(rate: ExchangeRate): string {
    return normalizeCurrency(rate.fromCurrency ?? rate.currency);
}

function rateToCurrency(rate: ExchangeRate, quoteCurrency?: string | null): string {
    return normalizeCurrency(rate.toCurrency ?? quoteCurrency);
}

function rateEffectiveDate(rate: ExchangeRate): Date | string | null | undefined {
    return rate.effectiveDate ?? rate.validFrom;
}

function selectCurrentRate(rates: ExchangeRate[], fromCurrency: string, toCurrency: string, quoteCurrency?: string | null): ExchangeRate | null {
    const from = normalizeCurrency(fromCurrency);
    const to = normalizeCurrency(toCurrency);
    const matching = rates
        .filter((rate) => rateFromCurrency(rate) === from && rateToCurrency(rate, quoteCurrency) === to)
        .sort((a, b) => new Date(rateEffectiveDate(b) ?? 0).getTime() - new Date(rateEffectiveDate(a) ?? 0).getTime());
    const now = new Date();
    return matching.find((rate) => rateAppliesOn(rate, now)) ?? matching[0] ?? null;
}

export function buildExchangeRatePairs(rates: ExchangeRate[], quoteCurrency?: string | null): { ratePairs: Record<string, number>; rateDates: Record<string, string> } {
    const ratePairs: Record<string, number> = {};
    const rateDates: Record<string, string> = {};

    const pairKeys = [...new Set(rates
        .map((rate) => `${rateFromCurrency(rate)}_${rateToCurrency(rate, quoteCurrency)}`)
        .filter((pair) => !pair.startsWith('_') && !pair.endsWith('_')))];

    pairKeys.forEach((pair) => {
        const [fromCurrency, toCurrency] = pair.split('_');
        const currentRate = selectCurrentRate(rates, fromCurrency, toCurrency, quoteCurrency);
        const value = Number(currentRate?.rate);

        if (!currentRate || !Number.isFinite(value) || value <= 0) return;

        const key = exchangeRatePairKey(fromCurrency, toCurrency);
        ratePairs[key] = value;
        rateDates[key] = isoDate(rateEffectiveDate(currentRate));
    });

    return { ratePairs, rateDates };
}

export function convertAmount(amount: number, from: string, to: string, rates: Record<string, number>): number {
    const source = normalizeCurrency(from);
    const target = normalizeCurrency(to);

    if (source === target) return amount;

    const directKey = exchangeRatePairKey(source, target);
    const inverseKey = exchangeRatePairKey(target, source);
    const directRate = rates[directKey];
    const inverseRate = rates[inverseKey];

    if (directRate != null) {
        return amount * directRate;
    }

    if (inverseRate != null) {
        return amount / inverseRate;
    }

    throw new Error(`Missing exchange rate for ${source} -> ${target}`);
}

function resolveDirectConversionRate(
    source: string,
    target: string,
    ratePairs: Record<string, number>,
    rateDates: Record<string, string>,
): { rate: number; rateDate: string; valuesUsed: Record<string, number> } | null {
    if (source === target) {
        return {
            rate: 1,
            rateDate: new Date().toISOString().slice(0, 10),
            valuesUsed: { [exchangeRatePairKey(source, target)]: 1 },
        };
    }

    const directKey = exchangeRatePairKey(source, target);
    const inverseKey = exchangeRatePairKey(target, source);

    if (ratePairs[directKey] != null) {
        return {
            rate: ratePairs[directKey],
            rateDate: rateDates[directKey] ?? new Date().toISOString().slice(0, 10),
            valuesUsed: { [directKey]: ratePairs[directKey] },
        };
    }

    if (ratePairs[inverseKey] != null) {
        const rate = 1 / ratePairs[inverseKey];
        return {
            rate,
            rateDate: rateDates[inverseKey] ?? new Date().toISOString().slice(0, 10),
            valuesUsed: { [inverseKey]: ratePairs[inverseKey] },
        };
    }

    return null;
}

@Injectable()
export class ContractExportPresentationService {
    constructor(
        @InjectRepository(ExchangeRate)
        private readonly exchangeRateRepo: Repository<ExchangeRate>,
    ) {}

    async buildContext(contract: Contract, hotel: Hotel | null, languageParam?: string, currencyParam?: string): Promise<ContractExportPresentationContext> {
        const language = this.normalizeLanguage(languageParam);
        const sourceCurrency = normalizeCurrency(contract.currency);
        const outputCurrency = normalizeCurrency(currencyParam);

        if (!outputCurrency) {
            throw new BadRequestException('currency query parameter is required to generate a contract PDF.');
        }

        const rates = await this.exchangeRateRepo.find({
            where: { hotelId: contract.hotelId },
            order: { effectiveDate: 'DESC', createdAt: 'DESC' },
        });

        const fx = this.resolveFx(sourceCurrency, outputCurrency, normalizeCurrency(hotel?.defaultCurrency || sourceCurrency), rates);
        if (!fx || !Number.isFinite(fx.rate)) {
            throw new BadRequestException(`No exchange rate is available for ${sourceCurrency} to ${outputCurrency}.`);
        }

        return {
            language,
            sourceCurrency,
            outputCurrency,
            fx,
        };
    }

    apply(model: ContractPdfGeneratorModel, context: ContractExportPresentationContext): ContractPdfGeneratorModel {
        const contract = {
            ...model.contract,
            currency: context.outputCurrency,
            depositAmount: model.contract.depositAmount != null
                ? this.convertMoney(model.contract.depositAmount, context)
                : model.contract.depositAmount,
        } as Contract;

        return {
            ...model,
            contract,
            contractLines: model.contractLines.map((line) => ({
                ...line,
                prices: (line.prices ?? []).map((price) => ({
                    ...price,
                    amount: this.convertMoney(price.amount, context),
                })),
            })) as ContractLine[],
            supplements: model.supplements.map((supplement) => {
                const shouldConvert = this.isFixedModifier(supplement.type);
                return {
                    ...supplement,
                    value: shouldConvert ? this.convertMoney(supplement.value, context) : supplement.value,
                    applicablePeriods: this.convertOverrides(supplement.applicablePeriods, shouldConvert, context),
                };
            }) as ContractSupplement[],
            reductions: model.reductions.map((reduction) => {
                const shouldConvert = this.isFixedModifier(reduction.calculationType);
                return {
                    ...reduction,
                    value: shouldConvert ? this.convertMoney(reduction.value, context) : reduction.value,
                    applicablePeriods: this.convertOverrides(reduction.applicablePeriods, shouldConvert, context),
                };
            }) as ContractReduction[],
            earlyBookings: model.earlyBookings.map((offer) => {
                const shouldConvert = this.isFixedModifier(offer.calculationType);
                return {
                    ...offer,
                    value: shouldConvert ? this.convertMoney(offer.value, context) : offer.value,
                    applicablePeriods: this.convertOverrides(offer.applicablePeriods, shouldConvert, context),
                };
            }) as ContractEarlyBooking[],
            spos: model.spos.map((spo) => {
                const shouldConvert = spo.benefitType === 'FIXED_DISCOUNT';
                return {
                    ...spo,
                    value: shouldConvert ? this.convertMoney(spo.value, context) : spo.value,
                    benefitValue: shouldConvert ? this.convertMoney(spo.benefitValue, context) : spo.benefitValue,
                    applicablePeriods: this.convertOverrides(spo.applicablePeriods, shouldConvert, context),
                };
            }) as ContractSpo[],
            cancellations: model.cancellations.map((rule) => {
                const shouldConvert = rule.penaltyType === 'FIXED_AMOUNT';
                return {
                    ...rule,
                    baseValue: shouldConvert ? this.convertMoney(rule.baseValue, context) : rule.baseValue,
                    applicablePeriods: this.convertOverrides(rule.applicablePeriods, shouldConvert, context),
                };
            }) as ContractCancellationRule[],
        };
    }

    convertMoney(value: number | string | null | undefined, context: ContractExportPresentationContext): number {
        const amount = Number(value ?? 0);
        const converted = (Number.isFinite(amount) ? amount : 0) * context.fx.rate;
        return this.roundCurrency(converted, context.outputCurrency);
    }

    private normalizeLanguage(language?: string): ContractExportLanguage {
        const normalized = (language || '').toLowerCase();
        if (normalized === 'fr' || normalized === 'en') return normalized;
        throw new BadRequestException('language query parameter must be "fr" or "en".');
    }

    private resolveFx(sourceCurrency: string, outputCurrency: string, hotelCurrency: string, rates: ExchangeRate[]): ContractExportFxContext | null {
        if (sourceCurrency === outputCurrency) {
            return {
                sourceCurrency,
                outputCurrency,
                rate: 1,
                rateDate: new Date().toISOString().slice(0, 10),
                source: 'BASE_CURRENCY',
                valuesUsed: { [sourceCurrency]: 1 },
            };
        }

        const { ratePairs, rateDates } = buildExchangeRatePairs(rates, hotelCurrency);
        const directConversion = resolveDirectConversionRate(sourceCurrency, outputCurrency, ratePairs, rateDates);

        if (directConversion && Number.isFinite(directConversion.rate)) {
            return {
                sourceCurrency,
                outputCurrency,
                rate: directConversion.rate,
                rateDate: directConversion.rateDate,
                source: 'EXCHANGE_RATE_TABLE',
                valuesUsed: directConversion.valuesUsed,
            };
        }

        const sourceToBase = resolveDirectConversionRate(sourceCurrency, hotelCurrency, ratePairs, rateDates);
        const baseToTarget = resolveDirectConversionRate(hotelCurrency, outputCurrency, ratePairs, rateDates);
        if (sourceToBase && baseToTarget) {
            const rate = sourceToBase.rate * baseToTarget.rate;
            return {
                sourceCurrency,
                outputCurrency,
                rate,
                rateDate: baseToTarget.rateDate,
                source: 'EXCHANGE_RATE_TABLE',
                valuesUsed: { ...sourceToBase.valuesUsed, ...baseToTarget.valuesUsed },
            };
        }

        return null;
    }

    private roundCurrency(amount: number, currency: string): number {
        const decimals = CURRENCY_DECIMALS[currency] ?? 2;
        const factor = 10 ** decimals;
        return Math.round((Number.isFinite(amount) ? amount : 0) * factor) / factor;
    }

    private isFixedModifier(type?: string | null): boolean {
        return Boolean(type && !['PERCENTAGE', 'FREE', 'FORMULA'].includes(type));
    }

    private convertOverrides<T extends { overrideValue?: number | string | null }>(
        periods: T[] | undefined,
        shouldConvert: boolean,
        context: ContractExportPresentationContext,
    ): T[] {
        return (periods ?? []).map((period) => ({
            ...period,
            overrideValue: shouldConvert && period.overrideValue != null
                ? this.convertMoney(period.overrideValue, context)
                : period.overrideValue,
        }));
    }
}
