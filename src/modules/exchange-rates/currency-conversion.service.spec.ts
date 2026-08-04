import { CurrencyConversionService } from './currency-conversion.service';
import { ExchangeRate } from './entities/exchange-rate.entity';

describe('CurrencyConversionService', () => {
    const exchangeRateRepo = {
        find: jest.fn(),
    };
    const hotelRepo = {
        findOne: jest.fn(),
    };

    let service: CurrencyConversionService;

    const rate = (partial: Partial<ExchangeRate>): ExchangeRate => ({
        id: partial.id ?? 1,
        hotelId: partial.hotelId ?? 1,
        fromCurrency: partial.fromCurrency,
        toCurrency: partial.toCurrency,
        currency: partial.currency,
        rate: partial.rate ?? 1,
        effectiveDate: partial.effectiveDate,
        validFrom: partial.validFrom,
    } as ExchangeRate);

    beforeEach(() => {
        jest.clearAllMocks();
        service = new CurrencyConversionService(exchangeRateRepo as any, hotelRepo as any);
        exchangeRateRepo.find.mockResolvedValue([]);
        hotelRepo.findOne.mockResolvedValue({ id: 1, defaultCurrency: 'TND' });
    });

    it('resolves identity conversion without loading exchange rates', async () => {
        const result = await service.resolveRate('eur', 'EUR', 1, '2026-01-15');

        expect(result).toMatchObject({
            type: 'identity',
            rate: 1,
            sourceCurrency: 'EUR',
            targetCurrency: 'EUR',
            rateDate: '2026-01-15',
            pairsUsed: [],
        });
        expect(exchangeRateRepo.find).not.toHaveBeenCalled();
    });

    it('resolves a direct rate', async () => {
        exchangeRateRepo.find.mockResolvedValue([
            rate({ id: 10, fromCurrency: 'EUR', toCurrency: 'TND', rate: 3.1, effectiveDate: new Date('2026-01-01') }),
        ]);

        const result = await service.resolveRate('EUR', 'TND', 1, '2026-01-15');

        expect(result.type).toBe('direct');
        expect(result.rate).toBe(3.1);
        expect(result.pairsUsed).toEqual([expect.objectContaining({
            key: 'EUR_TND',
            rate: 3.1,
            effectiveDate: '2026-01-01',
        })]);
    });

    it('resolves an inverse rate', async () => {
        exchangeRateRepo.find.mockResolvedValue([
            rate({ id: 10, fromCurrency: 'EUR', toCurrency: 'TND', rate: 3.1, effectiveDate: new Date('2026-01-01') }),
        ]);

        const result = await service.resolveRate('TND', 'EUR', 1, '2026-01-15');

        expect(result.type).toBe('inverse');
        expect(result.rate).toBeCloseTo(1 / 3.1);
        expect(result.pairsUsed[0]).toMatchObject({ key: 'EUR_TND', rate: 3.1 });
    });

    it('resolves a cross rate through the hotel default currency', async () => {
        exchangeRateRepo.find.mockResolvedValue([
            rate({ id: 10, fromCurrency: 'EUR', toCurrency: 'TND', rate: 3.1, effectiveDate: new Date('2026-01-01') }),
            rate({ id: 11, fromCurrency: 'USD', toCurrency: 'TND', rate: 3.0, effectiveDate: new Date('2026-01-02') }),
        ]);

        const result = await service.resolveRate('EUR', 'USD', 1, '2026-01-15');

        expect(result.type).toBe('cross');
        expect(result.pivotCurrency).toBe('TND');
        expect(result.rate).toBeCloseTo(3.1 * (1 / 3.0));
        expect(result.rateDate).toBe('2026-01-02');
        expect(result.pairsUsed.map((pair) => pair.key)).toEqual(['EUR_TND', 'USD_TND']);
    });

    it('returns missing-rate metadata when no path exists', async () => {
        exchangeRateRepo.find.mockResolvedValue([
            rate({ id: 10, fromCurrency: 'EUR', toCurrency: 'TND', rate: 3.1, effectiveDate: new Date('2026-01-01') }),
        ]);

        const result = await service.resolveRate('EUR', 'GBP', 1, '2026-01-15');

        expect(result).toMatchObject({
            type: 'unresolved',
            rate: null,
            rateDate: null,
            missingRateReason: 'No exchange rate is available for EUR to GBP.',
        });
    });

    it('selects the latest rate effective on or before the as-of date', async () => {
        exchangeRateRepo.find.mockResolvedValue([
            rate({ id: 12, fromCurrency: 'EUR', toCurrency: 'TND', rate: 3.3, effectiveDate: new Date('2026-03-01') }),
            rate({ id: 11, fromCurrency: 'EUR', toCurrency: 'TND', rate: 3.2, effectiveDate: new Date('2026-02-01') }),
            rate({ id: 10, fromCurrency: 'EUR', toCurrency: 'TND', rate: 3.1, effectiveDate: new Date('2026-01-01') }),
        ]);

        const result = await service.resolveRate('EUR', 'TND', 1, '2026-02-15');

        expect(result.type).toBe('direct');
        expect(result.rate).toBe(3.2);
        expect(result.rateDate).toBe('2026-02-01');
    });

    it('converts amounts and preserves conversion metadata', async () => {
        exchangeRateRepo.find.mockResolvedValue([
            rate({ id: 10, fromCurrency: 'EUR', toCurrency: 'TND', rate: 3.1, effectiveDate: new Date('2026-01-01') }),
        ]);

        const result = await service.convertAmount(72, 'EUR', 'TND', 1, '2026-01-15');

        expect(result.convertedAmount).toBeCloseTo(223.2);
        expect(result.type).toBe('direct');
        expect(result.pairsUsed[0]).toMatchObject({ key: 'EUR_TND', rate: 3.1 });
    });
});
