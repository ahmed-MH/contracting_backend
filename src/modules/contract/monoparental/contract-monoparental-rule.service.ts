import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ContractMonoparentalRule } from './entities/contract-monoparental-rule.entity';
import { ContractMonoparentalRuleRoom } from './entities/contract-monoparental-rule-room.entity';
import { ContractMonoparentalRulePeriod } from './entities/contract-monoparental-rule-period.entity';
import { Contract } from '../core/entities/contract.entity';
import { ContractRoom } from '../core/entities/contract-room.entity';
import { Period } from '../core/entities/period.entity';
import { TemplateMonoparentalRule } from '../../catalog/monoparental/entities/template-monoparental-rule.entity';
import { UpdateContractMonoparentalRuleDto } from './dto/update-contract-monoparental-rule.dto';

@Injectable()
export class ContractMonoparentalRuleService {
    constructor(
        @InjectRepository(ContractMonoparentalRule)
        private readonly ruleRepo: Repository<ContractMonoparentalRule>,

        @InjectRepository(ContractMonoparentalRuleRoom)
        private readonly ruleRoomRepo: Repository<ContractMonoparentalRuleRoom>,

        @InjectRepository(ContractMonoparentalRulePeriod)
        private readonly rulePeriodRepo: Repository<ContractMonoparentalRulePeriod>,

        @InjectRepository(Contract)
        private readonly contractRepo: Repository<Contract>,

        @InjectRepository(ContractRoom)
        private readonly contractRoomRepo: Repository<ContractRoom>,

        @InjectRepository(Period)
        private readonly periodRepo: Repository<Period>,

        @InjectRepository(TemplateMonoparentalRule)
        private readonly templateRepo: Repository<TemplateMonoparentalRule>,
    ) { }

    private async findContractOrThrow(hotelId: number, contractId: number): Promise<Contract> {
        const contract = await this.contractRepo.findOne({
            where: { id: contractId, hotelId },
        });
        if (!contract) {
            throw new NotFoundException(`Contract #${contractId} not found in hotel #${hotelId}`);
        }
        return contract;
    }

    private async findRuleOrThrow(
        hotelId: number,
        contractId: number,
        id: number,
        relations: string[] = [],
    ): Promise<ContractMonoparentalRule> {
        const rule = await this.ruleRepo.findOne({
            where: { id, contract: { id: contractId, hotelId } },
            relations,
        });
        if (!rule) {
            throw new NotFoundException(`ContractMonoparentalRule #${id} not found in contract #${contractId}`);
        }
        return rule;
    }

    private assertAllFound(resource: string, requestedIds: number[], foundCount: number, contractId: number): void {
        const uniqueIds = [...new Set(requestedIds)];
        if (foundCount !== uniqueIds.length) {
            throw new NotFoundException(`${resource} not found in contract #${contractId}`);
        }
    }

    private async findContractRoomsOrThrow(hotelId: number, contractId: number, ids: number[]): Promise<ContractRoom[]> {
        const uniqueIds = [...new Set(ids)];
        if (uniqueIds.length === 0) return [];

        const rooms = await this.contractRoomRepo.find({
            where: { id: In(uniqueIds), contract: { id: contractId, hotelId } },
        });
        this.assertAllFound('ContractRoom', uniqueIds, rooms.length, contractId);
        return rooms;
    }

    private async findPeriodsOrThrow(hotelId: number, contractId: number, ids: number[]): Promise<Period[]> {
        const uniqueIds = [...new Set(ids)];
        if (uniqueIds.length === 0) return [];

        const periods = await this.periodRepo.find({
            where: { id: In(uniqueIds), contract: { id: contractId, hotelId } },
        });
        this.assertAllFound('Period', uniqueIds, periods.length, contractId);
        return periods;
    }

    // Fetch all monoparental rules for a given contract (with targeting)
    async findByContract(hotelId: number, contractId: number): Promise<ContractMonoparentalRule[]> {
        await this.findContractOrThrow(hotelId, contractId);
        return this.ruleRepo.find({
            where: { contract: { id: contractId, hotelId } },
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

    // Clone a TemplateMonoparentalRule into a ContractMonoparentalRule (verifies hotelId)
    async importFromTemplate(
        hotelId: number,
        contractId: number,
        templateId: number,
    ): Promise<ContractMonoparentalRule> {
        const contract = await this.findContractOrThrow(hotelId, contractId);

        const template = await this.templateRepo.findOne({
            where: { id: templateId, hotelId },
        });
        if (!template) {
            throw new NotFoundException(`TemplateMonoparentalRule #${templateId} not found in hotel #${hotelId}`);
        }

        // Clone template values — independent copy, no targeting initially
        const rule = this.ruleRepo.create({
            name: template.name,
            adultCount: template.adultCount,
            childCount: template.childCount,
            minAge: template.minAge,
            maxAge: template.maxAge,
            baseRateType: template.baseRateType,
            childSurchargePercentage: template.childSurchargePercentage,
            childSurchargeBase: template.childSurchargeBase,
            templateId: template.id,
            contract,
        });
        
        const savedRule = await this.ruleRepo.save(rule);

        const periods = await this.periodRepo.find({ where: { contract: { id: contractId, hotelId } } });
        const periodJunctions = periods.map(period => this.rulePeriodRepo.create({ contractMonoparentalRule: savedRule, period }));
        await this.rulePeriodRepo.save(periodJunctions);

        return savedRule;
    }

    // Update rule values and/or targeting
    async update(
        hotelId: number,
        contractId: number,
        id: number,
        dto: UpdateContractMonoparentalRuleDto,
    ): Promise<ContractMonoparentalRule> {
        const rule = await this.findRuleOrThrow(hotelId, contractId, id, [
            'applicableContractRooms',
            'applicablePeriods',
        ]);

        if (dto.applicableContractRoomIds?.length) {
            await this.findContractRoomsOrThrow(hotelId, contractId, dto.applicableContractRoomIds);
        }
        if (dto.applicablePeriods?.length) {
            await this.findPeriodsOrThrow(hotelId, contractId, dto.applicablePeriods.map(ap => ap.periodId));
        }

        // Update scalar fields
        if (dto.reference !== undefined) rule.reference = dto.reference || (null as any);
        if (dto.name !== undefined) rule.name = dto.name;
        if (dto.adultCount !== undefined) rule.adultCount = dto.adultCount;
        if (dto.childCount !== undefined) rule.childCount = dto.childCount;
        if (dto.minAge !== undefined) rule.minAge = dto.minAge;
        if (dto.maxAge !== undefined) rule.maxAge = dto.maxAge;
        if (dto.baseRateType !== undefined) rule.baseRateType = dto.baseRateType;
        if (dto.childSurchargePercentage !== undefined) rule.childSurchargePercentage = dto.childSurchargePercentage;
        if (dto.childSurchargeBase !== undefined) rule.childSurchargeBase = dto.childSurchargeBase;

        await this.ruleRepo.save(rule);

        // Update targeting — rooms (full replacement)
        if (dto.applicableContractRoomIds !== undefined) {
            const rooms = dto.applicableContractRoomIds.length > 0
                ? await this.findContractRoomsOrThrow(hotelId, contractId, dto.applicableContractRoomIds)
                : [];
            await this.ruleRoomRepo.delete({ contractMonoparentalRule: { id } });

            if (dto.applicableContractRoomIds.length > 0) {
                const junctions = rooms.map((room) =>
                    this.ruleRoomRepo.create({ contractMonoparentalRule: rule, contractRoom: room }),
                );
                await this.ruleRoomRepo.save(junctions);
            }
        }

        // Update targeting — periods (full replacement)
        if (dto.applicablePeriods !== undefined) {
            const periods = dto.applicablePeriods.length > 0
                ? await this.findPeriodsOrThrow(hotelId, contractId, dto.applicablePeriods.map(ap => ap.periodId))
                : [];
            await this.rulePeriodRepo.delete({ contractMonoparentalRule: { id } });

            if (dto.applicablePeriods.length > 0) {
                const junctions = dto.applicablePeriods.map((ap) => {
                    const period = periods.find(p => p.id === ap.periodId);
                    if (!period) return null;
                    return this.rulePeriodRepo.create({
                        contractMonoparentalRule: rule,
                        period,
                        overrideBaseRateType: ap.overrideBaseRateType,
                        overrideChildSurchargeBase: ap.overrideChildSurchargeBase,
                        overrideChildSurchargeValue: ap.overrideChildSurchargeValue,
                    });
                }).filter(j => j !== null);
                if (junctions.length > 0) {
                    await this.rulePeriodRepo.save(junctions as ContractMonoparentalRulePeriod[]);
                }
            }
        }

        // Reload with fresh relations
        return this.ruleRepo.findOne({
            where: { id, contract: { id: contractId, hotelId } },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicableContractRooms.contractRoom.roomType',
                'applicablePeriods',
                'applicablePeriods.period',
            ],
        }) as Promise<ContractMonoparentalRule>;
    }

    // Hard delete a contract monoparental rule
    async remove(hotelId: number, contractId: number, id: number): Promise<void> {
        const rule = await this.findRuleOrThrow(hotelId, contractId, id);
        await this.ruleRepo.remove(rule);
    }
}
