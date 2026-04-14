import { ContractController } from './contract.controller';

describe('ContractController activation check', () => {
    it('should pass hotelId and contractId to activation validation service', async () => {
        const validation = {
            isValid: false,
            errors: [{ code: 'MISSING_PERIODS', message: 'Contract has no periods' }],
            warnings: [],
            summary: {
                missingPeriods: true,
                uncoveredDateRanges: [],
                missingRooms: false,
                missingRates: [],
                invalidTargets: [],
            },
        };
        const service = {
            validateActivation: jest.fn().mockResolvedValue(validation),
        };
        const controller = new ContractController(service as any);
        const req = { headers: { 'x-hotel-id': '7' } } as any;

        await expect(controller.validateActivation(req, 42)).resolves.toEqual(validation);
        expect(service.validateActivation).toHaveBeenCalledWith(7, 42);
    });
});
