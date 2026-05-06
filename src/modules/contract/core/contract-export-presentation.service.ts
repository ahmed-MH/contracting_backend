import { BadRequestException, Injectable } from '@nestjs/common';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { CurrencyConversionService, CurrencyRateResolution } from '../../exchange-rates/currency-conversion.service';
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

@Injectable()
export class ContractExportPresentationService {
    constructor(
        private readonly currencyConversionService: CurrencyConversionService,
    ) {}

    async buildContext(contract: Contract, hotel: Hotel | null, languageParam?: string, currencyParam?: string): Promise<ContractExportPresentationContext> {
        const language = this.normalizeLanguage(languageParam);
        const sourceCurrency = normalizeCurrency(contract.currency);
        const outputCurrency = normalizeCurrency(currencyParam);

        if (!outputCurrency) {
            throw new BadRequestException('currency query parameter is required to generate a contract PDF.');
        }

        const fx = await this.resolveFx(sourceCurrency, outputCurrency, contract.hotelId, normalizeCurrency(hotel?.defaultCurrency || sourceCurrency));
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
            paymentPolicy: model.contract.paymentPolicy
                ? {
                    ...model.contract.paymentPolicy,
                    deposit: model.contract.paymentPolicy.deposit?.type === 'AMOUNT'
                        ? {
                            ...model.contract.paymentPolicy.deposit,
                            value: this.convertMoney(model.contract.paymentPolicy.deposit.value, context),
                            currency: context.outputCurrency,
                        }
                        : model.contract.paymentPolicy.deposit,
                }
                : model.contract.paymentPolicy,
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

    private async resolveFx(sourceCurrency: string, outputCurrency: string, hotelId: number, hotelCurrency: string): Promise<ContractExportFxContext | null> {
        const resolution = await this.currencyConversionService.resolveRate(
            sourceCurrency,
            outputCurrency,
            hotelId,
            undefined,
            { pivotCurrency: hotelCurrency },
        );

        if (resolution.rate == null || !Number.isFinite(resolution.rate)) return null;

        return {
            sourceCurrency,
            outputCurrency,
            rate: resolution.rate,
            rateDate: this.toContractRateDate(resolution),
            source: resolution.type === 'identity' ? 'BASE_CURRENCY' : 'EXCHANGE_RATE_TABLE',
            valuesUsed: this.toContractValuesUsed(resolution),
        };
    }

    private toContractRateDate(resolution: CurrencyRateResolution): string {
        return resolution.rateDate ?? isoDate();
    }

    private toContractValuesUsed(resolution: CurrencyRateResolution): Record<string, number> {
        if (resolution.type === 'identity') {
            return { [resolution.sourceCurrency]: 1 };
        }

        return resolution.pairsUsed.reduce<Record<string, number>>((acc, pair) => {
            acc[pair.key] = pair.rate;
            return acc;
        }, {});
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
