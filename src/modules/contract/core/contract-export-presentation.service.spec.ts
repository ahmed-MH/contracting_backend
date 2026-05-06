import { BadRequestException } from '@nestjs/common';
import { ContractExportPresentationService } from './contract-export-presentation.service';
import { Contract } from './entities/contract.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';

describe('ContractExportPresentationService', () => {
    const currencyConversionService = {
        resolveRate: jest.fn(),
    };

    let service: ContractExportPresentationService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ContractExportPresentationService(currencyConversionService as any);
    });

    it('uses the shared currency conversion service when building the export context', async () => {
        currencyConversionService.resolveRate.mockResolvedValue({
            type: 'direct',
            sourceCurrency: 'EUR',
            targetCurrency: 'TND',
            rate: 3.1,
            rateDate: '2026-01-01',
            pairsUsed: [
                {
                    key: 'EUR_TND',
                    fromCurrency: 'EUR',
                    toCurrency: 'TND',
                    rate: 3.1,
                    effectiveDate: '2026-01-01',
                },
            ],
        });

        const context = await service.buildContext(
            { currency: 'EUR', hotelId: 1 } as Contract,
            { defaultCurrency: 'TND' } as Hotel,
            'en',
            'TND',
        );

        expect(currencyConversionService.resolveRate).toHaveBeenCalledWith(
            'EUR',
            'TND',
            1,
            undefined,
            { pivotCurrency: 'TND' },
        );
        expect(context.fx).toEqual({
            sourceCurrency: 'EUR',
            outputCurrency: 'TND',
            rate: 3.1,
            rateDate: '2026-01-01',
            source: 'EXCHANGE_RATE_TABLE',
            valuesUsed: { EUR_TND: 3.1 },
        });
        expect(service.convertMoney(72, context)).toBe(223.2);
    });

    it('preserves identity conversion metadata for contract export snapshots', async () => {
        currencyConversionService.resolveRate.mockResolvedValue({
            type: 'identity',
            sourceCurrency: 'EUR',
            targetCurrency: 'EUR',
            rate: 1,
            rateDate: '2026-01-15',
            pairsUsed: [],
        });

        const context = await service.buildContext(
            { currency: 'EUR', hotelId: 1 } as Contract,
            { defaultCurrency: 'TND' } as Hotel,
            'en',
            'EUR',
        );

        expect(context.fx).toMatchObject({
            rate: 1,
            rateDate: '2026-01-15',
            source: 'BASE_CURRENCY',
            valuesUsed: { EUR: 1 },
        });
    });

    it('throws the existing BadRequestException when the shared service cannot resolve a rate', async () => {
        currencyConversionService.resolveRate.mockResolvedValue({
            type: 'unresolved',
            sourceCurrency: 'EUR',
            targetCurrency: 'USD',
            rate: null,
            rateDate: null,
            pairsUsed: [],
            missingRateReason: 'No exchange rate is available for EUR to USD.',
        });

        await expect(service.buildContext(
            { currency: 'EUR', hotelId: 1 } as Contract,
            { defaultCurrency: 'TND' } as Hotel,
            'en',
            'USD',
        )).rejects.toThrow(BadRequestException);
    });
});
