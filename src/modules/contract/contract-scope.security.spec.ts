import { NotFoundException } from '@nestjs/common';
import { ContractSupplementService } from './supplement/contract-supplement.service';
import { ContractCancellationService } from './cancellation/contract-cancellation.service';

const repo = () => ({
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
});

describe('contract nested resource hotel scoping', () => {
    describe('ContractSupplementService', () => {
        const buildService = () => {
            const repos = {
                supplement: repo(),
                supplementRoom: repo(),
                supplementPeriod: repo(),
                contract: repo(),
                contractRoom: repo(),
                period: repo(),
                template: repo(),
            };

            const service = new ContractSupplementService(
                repos.supplement as any,
                repos.supplementRoom as any,
                repos.supplementPeriod as any,
                repos.contract as any,
                repos.contractRoom as any,
                repos.period as any,
                repos.template as any,
            );

            return { service, repos };
        };

        it('blocks reading a contract that is not under the active hotel', async () => {
            const { service, repos } = buildService();
            repos.contract.findOne.mockResolvedValue(null);

            await expect(service.findByContract(10, 99)).rejects.toThrow(NotFoundException);

            expect(repos.contract.findOne).toHaveBeenCalledWith({ where: { id: 99, hotelId: 10 } });
            expect(repos.supplement.find).not.toHaveBeenCalled();
        });

        it('rejects cross-hotel room targeting before mutating the supplement', async () => {
            const { service, repos } = buildService();
            repos.supplement.findOne.mockResolvedValue({ id: 5, name: 'Old' });
            repos.contractRoom.find.mockResolvedValue([]);

            await expect(
                service.update(10, 99, 5, {
                    name: 'Changed',
                    applicableContractRoomIds: [777],
                } as any),
            ).rejects.toThrow(NotFoundException);

            expect(repos.contractRoom.find).toHaveBeenCalledWith({
                where: { id: expect.anything(), contract: { id: 99, hotelId: 10 } },
            });
            expect(repos.supplement.save).not.toHaveBeenCalled();
            expect(repos.supplementRoom.delete).not.toHaveBeenCalled();
        });

        it('requires imported templates to belong to the active hotel', async () => {
            const { service, repos } = buildService();
            repos.contract.findOne.mockResolvedValue({ id: 99, hotelId: 10 });
            repos.template.findOne.mockResolvedValue(null);

            await expect(service.importFromTemplate(10, 99, 123)).rejects.toThrow(NotFoundException);

            expect(repos.template.findOne).toHaveBeenCalledWith({
                where: { id: 123, hotel: { id: 10 } },
            });
            expect(repos.supplement.save).not.toHaveBeenCalled();
        });
    });

    describe('ContractCancellationService', () => {
        const buildService = () => {
            const repos = {
                rule: repo(),
                periodJunction: repo(),
                roomJunction: repo(),
                template: repo(),
                period: repo(),
                contractRoom: repo(),
                contract: repo(),
            };

            const service = new ContractCancellationService(
                repos.rule as any,
                repos.periodJunction as any,
                repos.roomJunction as any,
                repos.template as any,
                repos.period as any,
                repos.contractRoom as any,
                repos.contract as any,
            );

            return { service, repos };
        };

        it('rejects cross-hotel room IDs on create before creating the rule', async () => {
            const { service, repos } = buildService();
            repos.contract.findOne.mockResolvedValue({ id: 99, hotelId: 10 });
            repos.contractRoom.find.mockResolvedValue([]);

            await expect(
                service.create(10, 99, {
                    name: 'Cancellation',
                    daysBeforeArrival: 7,
                    appliesToNoShow: false,
                    penaltyType: 'PERCENTAGE',
                    baseValue: 50,
                    contractRoomIds: [777],
                } as any),
            ).rejects.toThrow(NotFoundException);

            expect(repos.contractRoom.find).toHaveBeenCalledWith({
                where: { id: expect.anything(), contract: { id: 99, hotelId: 10 } },
            });
            expect(repos.rule.save).not.toHaveBeenCalled();
            expect(repos.roomJunction.save).not.toHaveBeenCalled();
        });

        it('blocks deleting a guessed cancellation rule from another hotel', async () => {
            const { service, repos } = buildService();
            repos.rule.findOne.mockResolvedValue(null);

            await expect(service.delete(10, 99, 500)).rejects.toThrow(NotFoundException);

            expect(repos.rule.findOne).toHaveBeenCalledWith({
                where: { id: 500, contract: { id: 99, hotelId: 10 } },
                relations: [],
            });
            expect(repos.rule.remove).not.toHaveBeenCalled();
        });
    });
});
