import { ContractExportPresentationService, buildExchangeRatePairs, convertAmount } from './contract-export-presentation.service';
import { ExchangeRate } from '../../exchange-rates/entities/exchange-rate.entity';
import { Contract } from './entities/contract.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';

describe('contract export currency conversion', () => {
    it('converts EUR to TND by multiplying the direct pair rate', () => {
        expect(convertAmount(72, 'EUR', 'TND', { EUR_TND: 3.1 })).toBeCloseTo(223.2);
    });

    it('converts TND to EUR by dividing the inverse pair rate', () => {
        expect(convertAmount(223.2, 'TND', 'EUR', { EUR_TND: 3.1 })).toBeCloseTo(72);
    });

    it('keeps the amount unchanged when currencies match', () => {
        expect(convertAmount(72, 'EUR', 'EUR', { EUR_TND: 3.1 })).toBe(72);
    });

    it('throws an explicit error when no direct or inverse pair exists', () => {
        expect(() => convertAmount(72, 'EUR', 'USD', { EUR_TND: 3.1 })).toThrow('Missing exchange rate for EUR -> USD');
    });

    it('builds stored rates as explicit currency pairs', () => {
        const { ratePairs } = buildExchangeRatePairs([
            {
                fromCurrency: 'EUR',
                toCurrency: 'TND',
                rate: 3.1,
                effectiveDate: new Date('2026-01-01'),
            } as ExchangeRate,
        ], 'TND');

        expect(ratePairs).toEqual({ EUR_TND: 3.1 });
    });

    it('uses the same direct pair rate when building the export context', async () => {
        const exchangeRateRepo = {
            find: jest.fn().mockResolvedValue([
                {
                    fromCurrency: 'EUR',
                    toCurrency: 'TND',
                    rate: 3.1,
                    effectiveDate: new Date('2026-01-01'),
                },
            ]),
        };
        const service = new ContractExportPresentationService(exchangeRateRepo as any);

        const context = await service.buildContext(
            { currency: 'EUR', hotelId: 1 } as Contract,
            { defaultCurrency: 'TND' } as Hotel,
            'en',
            'TND',
        );

        expect(context.fx.rate).toBe(3.1);
        expect(service.convertMoney(72, context)).toBe(223.2);
    });
});
