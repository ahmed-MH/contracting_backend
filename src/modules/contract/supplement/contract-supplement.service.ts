import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ContractSupplement } from './entities/contract-supplement.entity';
import { ContractSupplementRoom } from './entities/contract-supplement-room.entity';
import { ContractSupplementPeriod } from './entities/contract-supplement-period.entity';
import { Contract } from '../core/entities/contract.entity';
import { ContractRoom } from '../core/entities/contract-room.entity';
import { Period } from '../core/entities/period.entity';
import { TemplateSupplement } from '../../catalog/supplement/entities/template-supplement.entity';
import { UpdateContractSupplementDto } from './dto/update-contract-supplement.dto';

@Injectable()
export class ContractSupplementService {
    constructor(
        @InjectRepository(ContractSupplement)
        private readonly supplementRepo: Repository<ContractSupplement>,

        @InjectRepository(ContractSupplementRoom)
        private readonly csRoomRepo: Repository<ContractSupplementRoom>,

        @InjectRepository(ContractSupplementPeriod)
        private readonly csPeriodRepo: Repository<ContractSupplementPeriod>,

        @InjectRepository(Contract)
        private readonly contractRepo: Repository<Contract>,

        @InjectRepository(ContractRoom)
        private readonly contractRoomRepo: Repository<ContractRoom>,

        @InjectRepository(Period)
        private readonly periodRepo: Repository<Period>,

        @InjectRepository(TemplateSupplement)
        private readonly templateRepo: Repository<TemplateSupplement>,
    ) { }

    // Fetch all supplements for a given contract (with targeting relations)
    async findByContract(contractId: number): Promise<ContractSupplement[]> {
        return this.supplementRepo.find({
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

    // Clone a TemplateSupplement into a ContractSupplement.
    // If the template has a specificDate, auto-assigns the matching contract period.
    async importFromTemplate(
        contractId: number,
        templateId: number,
    ): Promise<ContractSupplement> {
        const contract = await this.contractRepo.findOne({
            where: { id: contractId },
        });
        if (!contract) {
            throw new NotFoundException(`Contract #${contractId} not found`);
        }

        const template = await this.templateRepo.findOne({
            where: { id: templateId },
        });
        if (!template) {
            throw new NotFoundException(`TemplateSupplement #${templateId} not found`);
        }

        // Clone template values — independent copy
        const supplement = this.supplementRepo.create({
            name: template.name,
            systemCode: template.systemCode,
            type: template.type,
            value: template.value,
            formula: template.formula,
            isMandatory: template.isMandatory,
            applicationType: template.applicationType,
            minAge: template.minAge,
            maxAge: template.maxAge,
            templateId: template.id,
            specificDate: template.specificDate ?? null,
            contract,
        });

        const saved = await this.supplementRepo.save(supplement);

        // Auto-assign matching period when supplement has a specificDate
        if (template.specificDate) {
            const specificMs = new Date(template.specificDate).getTime();

            const periods = await this.periodRepo.find({
                where: { contract: { id: contractId } },
            });

            const matchingPeriod = periods.find((p) => {
                const start = new Date(p.startDate).getTime();
                const end = new Date(p.endDate).getTime();
                return specificMs >= start && specificMs < end;
            });

            if (matchingPeriod) {
                const junction = this.csPeriodRepo.create({
                    contractSupplement: saved,
                    period: matchingPeriod,
                    overrideValue: null,
                });
                await this.csPeriodRepo.save(junction);
            }
        }

        // Return with relations loaded
        return this.supplementRepo.findOne({
            where: { id: saved.id },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicableContractRooms.contractRoom.roomType',
                'applicablePeriods',
                'applicablePeriods.period',
            ],
        }) as Promise<ContractSupplement>;
    }


    // Update supplement values and/or targeting
    async update(
        id: number,
        dto: UpdateContractSupplementDto,
    ): Promise<ContractSupplement> {
        const supplement = await this.supplementRepo.findOne({
            where: { id },
            relations: [
                'applicableContractRooms',
                'applicablePeriods',
            ],
        });
        if (!supplement) {
            throw new NotFoundException(`ContractSupplement #${id} not found`);
        }

        // Update scalar fields
        if (dto.reference !== undefined) supplement.reference = (dto.reference || null) as string;
        if (dto.name !== undefined) supplement.name = dto.name;
        if (dto.systemCode !== undefined) supplement.systemCode = dto.systemCode;
        if (dto.type !== undefined) supplement.type = dto.type;
        if (dto.value !== undefined) supplement.value = dto.value;
        if (dto.formula !== undefined) supplement.formula = dto.formula;
        if (dto.isMandatory !== undefined) supplement.isMandatory = dto.isMandatory;
        if (dto.applicationType !== undefined) supplement.applicationType = dto.applicationType;
        if (dto.minAge !== undefined) supplement.minAge = dto.minAge;
        if (dto.maxAge !== undefined) supplement.maxAge = dto.maxAge;

        await this.supplementRepo.save(supplement);

        // Update targeting — rooms (full replacement via junction entity)
        if (dto.applicableContractRoomIds !== undefined) {
            // Delete all existing room junctions for this supplement
            await this.csRoomRepo.delete({ contractSupplement: { id } });

            if (dto.applicableContractRoomIds.length > 0) {
                const rooms = await this.contractRoomRepo.find({
                    where: { id: In(dto.applicableContractRoomIds) },
                });
                const junctions = rooms.map((room) =>
                    this.csRoomRepo.create({ contractSupplement: supplement, contractRoom: room }),
                );
                await this.csRoomRepo.save(junctions);
            }
        }

        // ──────────────────────────────────────────────────────────────────
        // Matrix synchronization for periods:
        //   - Frontend sends ONLY the periods where toggle is ON.
        //   - Backend deletes ALL existing ContractSupplementPeriod rows for
        //     this supplement, then re-inserts only the ones in the payload.
        //   - Periods NOT in the payload → their junction row is gone → toggle OFF.
        // ──────────────────────────────────────────────────────────────────
        const newPeriods = dto.applicablePeriods;
        const legacyPeriodIds = dto.applicablePeriodIds;

        if (newPeriods !== undefined || legacyPeriodIds !== undefined) {
            // Full replacement: remove all existing period junctions
            await this.csPeriodRepo.delete({ contractSupplement: { id } });

            if (newPeriods && newPeriods.length > 0) {
                // New format: supports seasonal overrideValue per period
                const periodIds = newPeriods.map((p) => p.periodId);
                const periods = await this.periodRepo.find({
                    where: { id: In(periodIds) },
                });
                const periodMap = new Map(periods.map((p) => [p.id, p]));

                const junctions = newPeriods
                    .filter((p) => periodMap.has(p.periodId))
                    .map((p) =>
                        this.csPeriodRepo.create({
                            contractSupplement: supplement,
                            period: periodMap.get(p.periodId)!,
                            overrideValue: p.overrideValue ?? null,
                        }),
                    );

                if (junctions.length > 0) {
                    await this.csPeriodRepo.save(junctions);
                }

            } else if (legacyPeriodIds && legacyPeriodIds.length > 0) {
                // Legacy format (from old modal): no override value
                const periods = await this.periodRepo.find({
                    where: { id: In(legacyPeriodIds) },
                });
                const junctions = periods.map((period) =>
                    this.csPeriodRepo.create({
                        contractSupplement: supplement,
                        period,
                        overrideValue: null,
                    }),
                );
                await this.csPeriodRepo.save(junctions);
            }
            // If both are empty arrays → all periods deleted = all toggles OFF ✓
        }

        // Reload with fresh relations
        return this.supplementRepo.findOne({
            where: { id },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicableContractRooms.contractRoom.roomType',
                'applicablePeriods',
                'applicablePeriods.period',
            ],
        }) as Promise<ContractSupplement>;
    }

    // Hard delete a contract supplement (junction rows cascade automatically)
    async remove(id: number): Promise<void> {
        const result = await this.supplementRepo.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`ContractSupplement #${id} not found`);
        }
    }
}
