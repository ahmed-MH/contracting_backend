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

    // Fetch all monoparental rules for a given contract (with targeting)
    async findByContract(contractId: number): Promise<ContractMonoparentalRule[]> {
        return this.ruleRepo.find({
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

    // Clone a TemplateMonoparentalRule into a ContractMonoparentalRule (verifies hotelId)
    async importFromTemplate(
        contractId: number,
        templateId: number,
        hotelId: number,
    ): Promise<ContractMonoparentalRule> {
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

        const periods = await this.periodRepo.find({ where: { contract: { id: contractId } } });
        const periodJunctions = periods.map(period => this.rulePeriodRepo.create({ contractMonoparentalRule: savedRule, period }));
        await this.rulePeriodRepo.save(periodJunctions);

        return savedRule;
    }

    // Update rule values and/or targeting
    async update(
        id: number,
        dto: UpdateContractMonoparentalRuleDto,
    ): Promise<ContractMonoparentalRule> {
        const rule = await this.ruleRepo.findOne({
            where: { id },
            relations: ['applicableContractRooms', 'applicablePeriods'],
        });
        if (!rule) {
            throw new NotFoundException(`ContractMonoparentalRule #${id} not found`);
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
            await this.ruleRoomRepo.delete({ contractMonoparentalRule: { id } });

            if (dto.applicableContractRoomIds.length > 0) {
                const rooms = await this.contractRoomRepo.find({
                    where: { id: In(dto.applicableContractRoomIds) },
                });
                const junctions = rooms.map((room) =>
                    this.ruleRoomRepo.create({ contractMonoparentalRule: rule, contractRoom: room }),
                );
                await this.ruleRoomRepo.save(junctions);
            }
        }

        // Update targeting — periods (full replacement)
        if (dto.applicablePeriods !== undefined) {
            await this.rulePeriodRepo.delete({ contractMonoparentalRule: { id } });

            if (dto.applicablePeriods.length > 0) {
                const periodIds = dto.applicablePeriods.map(ap => ap.periodId);
                const periods = await this.periodRepo.find({
                    where: { id: In(periodIds) },
                });
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
            where: { id },
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
    async remove(id: number): Promise<void> {
        const result = await this.ruleRepo.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`ContractMonoparentalRule #${id} not found`);
        }
    }
}
