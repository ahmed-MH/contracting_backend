import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ContractReduction } from './entities/contract-reduction.entity';
import { ContractReductionRoom } from './entities/contract-reduction-room.entity';
import { ContractReductionPeriod } from './entities/contract-reduction-period.entity';
import { Contract } from '../core/entities/contract.entity';
import { ContractRoom } from '../core/entities/contract-room.entity';
import { Period } from '../core/entities/period.entity';
import { TemplateReduction } from '../../catalog/reduction/entities/template-reduction.entity';
import { UpdateContractReductionDto } from './dto/update-contract-reduction.dto';

@Injectable()
export class ContractReductionService {
    constructor(
        @InjectRepository(ContractReduction)
        private readonly reductionRepo: Repository<ContractReduction>,

        @InjectRepository(ContractReductionRoom)
        private readonly crRoomRepo: Repository<ContractReductionRoom>,

        @InjectRepository(ContractReductionPeriod)
        private readonly crPeriodRepo: Repository<ContractReductionPeriod>,

        @InjectRepository(Contract)
        private readonly contractRepo: Repository<Contract>,

        @InjectRepository(ContractRoom)
        private readonly contractRoomRepo: Repository<ContractRoom>,

        @InjectRepository(Period)
        private readonly periodRepo: Repository<Period>,

        @InjectRepository(TemplateReduction)
        private readonly templateRepo: Repository<TemplateReduction>,
    ) { }

    // Fetch all reductions for a given contract (with targeting relations)
    async findByContract(contractId: number): Promise<ContractReduction[]> {
        return this.reductionRepo.find({
            where: { contract: { id: contractId } },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicableContractRooms.contractRoom.roomType',
                'applicablePeriods',
                'applicablePeriods.period',
            ],
            order: { id: 'DESC' },
        });
    }

    // Clone a TemplateReduction into a ContractReduction (verifies hotelId)
    async importFromTemplate(
        contractId: number,
        templateId: number,
        hotelId: number,
    ): Promise<ContractReduction> {
        const contract = await this.contractRepo.findOne({
            where: { id: contractId, hotelId },
        });
        if (!contract) {
            throw new NotFoundException(`Contract #${contractId} not found in hotel #${hotelId}`);
        }

        const template = await this.templateRepo.findOne({
            where: { id: templateId, hotelId },
        });
        if (!template) {
            throw new NotFoundException(`TemplateReduction #${templateId} not found in hotel #${hotelId}`);
        }

        // Clone template values — independent copy, no targeting initially
        const reduction = this.reductionRepo.create({
            name: template.name,
            systemCode: template.systemCode,
            calculationType: template.calculationType,
            value: template.value,
            paxType: template.paxType,
            paxOrder: template.paxOrder,
            minAge: template.minAge,
            maxAge: template.maxAge,
            applicationType: template.applicationType,
            templateId: template.id,
            contract,
        });

        return this.reductionRepo.save(reduction);
    }

    // Update reduction values and/or targeting
    async update(
        id: number,
        dto: UpdateContractReductionDto,
    ): Promise<ContractReduction> {
        const reduction = await this.reductionRepo.findOne({
            where: { id },
            relations: [
                'applicableContractRooms',
                'applicablePeriods',
            ],
        });
        if (!reduction) {
            throw new NotFoundException(`ContractReduction #${id} not found`);
        }

        // Update scalar fields
        if (dto.reference !== undefined) reduction.reference = dto.reference || (null as any);
        if (dto.name !== undefined) reduction.name = dto.name;
        if (dto.systemCode !== undefined) reduction.systemCode = dto.systemCode;
        if (dto.calculationType !== undefined) reduction.calculationType = dto.calculationType;
        if (dto.applicationType !== undefined) reduction.applicationType = dto.applicationType;
        if (dto.value !== undefined) reduction.value = dto.value;
        if (dto.paxType !== undefined) reduction.paxType = dto.paxType;
        if (dto.paxOrder !== undefined) reduction.paxOrder = dto.paxOrder;
        if (dto.minAge !== undefined) reduction.minAge = dto.minAge;
        if (dto.maxAge !== undefined) reduction.maxAge = dto.maxAge;

        await this.reductionRepo.save(reduction);

        // Update targeting — rooms (full replacement)
        if (dto.applicableContractRoomIds !== undefined) {
            await this.crRoomRepo.delete({ contractReduction: { id } });

            if (dto.applicableContractRoomIds.length > 0) {
                const rooms = await this.contractRoomRepo.find({
                    where: { id: In(dto.applicableContractRoomIds) },
                });
                const junctions = rooms.map((room) =>
                    this.crRoomRepo.create({ contractReduction: reduction, contractRoom: room }),
                );
                await this.crRoomRepo.save(junctions);
            }
        }

        // Update targeting — periods (full replacement)
        if (dto.applicablePeriods !== undefined) {
            await this.crPeriodRepo.delete({ contractReduction: { id } });

            if (dto.applicablePeriods.length > 0) {
                const periodIds = dto.applicablePeriods.map(ap => ap.periodId);
                const periods = await this.periodRepo.find({
                    where: { id: In(periodIds) },
                });
                const junctions = dto.applicablePeriods.map((ap) => {
                    const period = periods.find(p => p.id === ap.periodId);
                    if (!period) return null;
                    return this.crPeriodRepo.create({
                        contractReduction: reduction,
                        period,
                        overrideValue: ap.overrideValue,
                    });
                }).filter(j => j !== null);
                if (junctions.length > 0) {
                    await this.crPeriodRepo.save(junctions);
                }
            }
        }

        // Reload with fresh relations
        return this.reductionRepo.findOne({
            where: { id },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicableContractRooms.contractRoom.roomType',
                'applicablePeriods',
                'applicablePeriods.period',
            ],
        }) as Promise<ContractReduction>;
    }

    // Hard delete a contract reduction (junction rows cascade automatically)
    async remove(id: number): Promise<void> {
        const result = await this.reductionRepo.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`ContractReduction #${id} not found`);
        }
    }
}
