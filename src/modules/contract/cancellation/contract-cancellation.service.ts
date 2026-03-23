import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ContractCancellationRule } from './entities/contract-cancellation-rule.entity';
import { ContractCancellationRulePeriod } from './entities/contract-cancellation-rule-period.entity';
import { ContractCancellationRuleRoom } from './entities/contract-cancellation-rule-room.entity';
import { TemplateCancellationRule } from '../../catalog/cancellation/entities/template-cancellation-rule.entity';
import { Period } from '../core/entities/period.entity';
import { ContractRoom } from '../core/entities/contract-room.entity';
import {
    CreateContractCancellationRuleDto,
    UpdateContractCancellationRuleDto,
    ImportCancellationRuleDto,
} from './dto/contract-cancellation.dto';

@Injectable()
export class ContractCancellationService {
    constructor(
        @InjectRepository(ContractCancellationRule)
        private readonly ruleRepo: Repository<ContractCancellationRule>,

        @InjectRepository(ContractCancellationRulePeriod)
        private readonly periodRepo: Repository<ContractCancellationRulePeriod>,

        @InjectRepository(ContractCancellationRuleRoom)
        private readonly roomRepo: Repository<ContractCancellationRuleRoom>,

        @InjectRepository(TemplateCancellationRule)
        private readonly templateRepo: Repository<TemplateCancellationRule>,

        @InjectRepository(Period)
        private readonly contractPeriodRepo: Repository<Period>,

        @InjectRepository(ContractRoom)
        private readonly contractRoomRepo: Repository<ContractRoom>,
    ) { }

    // ─── READ ─────────────────────────────────────────────────────────
    async findAllByContract(contractId: number): Promise<ContractCancellationRule[]> {
        return this.ruleRepo.find({
            where: { contractId },
            relations: [
                'applicablePeriods',
                'applicablePeriods.period',
                'applicableRooms',
                'applicableRooms.contractRoom',
                'applicableRooms.contractRoom.roomType',
            ],
            order: { id: 'DESC' },
        });
    }

    // ─── CREATE ───────────────────────────────────────────────────────
    async create(contractId: number, dto: CreateContractCancellationRuleDto): Promise<ContractCancellationRule> {
        const { contractRoomIds, periodIds, ...ruleData } = dto;

        const rule = this.ruleRepo.create({ ...ruleData, contractId });
        const savedRule = await this.ruleRepo.save(rule);

        if (contractRoomIds?.length > 0) {
            const rooms = await this.contractRoomRepo.find({ where: { id: In(contractRoomIds) } });
            const roomJunctions = rooms.map(room =>
                this.roomRepo.create({ contractCancellationRule: savedRule, contractRoom: room }),
            );
            await this.roomRepo.save(roomJunctions);
        }

        if (periodIds && periodIds.length > 0) {
            const periods = await this.contractPeriodRepo.find({ where: { id: In(periodIds) } });
            const periodJunctions = periods.map(period =>
                this.periodRepo.create({ contractCancellationRule: savedRule, period }),
            );
            await this.periodRepo.save(periodJunctions);
        }

        return savedRule;
    }

    // ─── UPDATE ───────────────────────────────────────────────────────
    async update(id: number, dto: UpdateContractCancellationRuleDto): Promise<ContractCancellationRule> {
        const rule = await this.ruleRepo.findOne({
            where: { id },
            relations: ['applicablePeriods', 'applicableRooms'],
        });
        if (!rule) throw new NotFoundException(`Cancellation rule #${id} not found`);

        // ── Scalar fields ──────────────────────────────────────────────
        const { applicablePeriods, contractRoomIds, ...ruleData } = dto;
        Object.assign(rule, ruleData);
        await this.ruleRepo.save(rule);

        // ── Periods — Drop & Replace (mirror of ReductionService) ──────
        if (applicablePeriods !== undefined) {
            // Hard delete via injected repository — resolves FK correctly
            await this.periodRepo.delete({ contractCancellationRule: { id } });

            if (applicablePeriods.length > 0) {
                const periodIds = applicablePeriods.map(ap => Number(ap.periodId));
                const periods = await this.contractPeriodRepo.find({ where: { id: In(periodIds) } });

                const junctions = applicablePeriods.map(ap => {
                    const period = periods.find(p => p.id === Number(ap.periodId));
                    if (!period) return null;
                    return this.periodRepo.create({
                        contractCancellationRule: rule,
                        period,
                        overrideValue: ap.overrideValue ?? null,
                    });
                }).filter((j): j is ContractCancellationRulePeriod => j !== null);

                if (junctions.length > 0) {
                    await this.periodRepo.save(junctions);
                }
            }
        }

        // ── Rooms — Drop & Replace ─────────────────────────────────────
        if (contractRoomIds !== undefined) {
            await this.roomRepo.delete({ contractCancellationRule: { id } });

            if (contractRoomIds.length > 0) {
                const rooms = await this.contractRoomRepo.find({ where: { id: In(contractRoomIds) } });
                const junctions = rooms.map(room =>
                    this.roomRepo.create({ contractCancellationRule: rule, contractRoom: room }),
                );
                await this.roomRepo.save(junctions);
            }
        }

        // ── Reload with fresh relations ────────────────────────────────
        return this.ruleRepo.findOne({
            where: { id },
            relations: [
                'applicablePeriods',
                'applicablePeriods.period',
                'applicableRooms',
                'applicableRooms.contractRoom',
                'applicableRooms.contractRoom.roomType',
            ],
        }) as Promise<ContractCancellationRule>;
    }

    // ─── IMPORT ───────────────────────────────────────────────────────
    async importFromTemplate(contractId: number, dto: ImportCancellationRuleDto): Promise<ContractCancellationRule> {
        const template = await this.templateRepo.findOne({ where: { id: dto.templateId } });
        if (!template) throw new NotFoundException('Template not found');

        const rule = this.ruleRepo.create({
            name: template.name,
            daysBeforeArrival: template.daysBeforeArrival,
            appliesToNoShow: template.appliesToNoShow,
            minStayCondition: template.minStayCondition,
            penaltyType: template.penaltyType,
            baseValue: template.baseValue,
            contractId,
            templateCancellationRuleId: template.id,
        });

        return this.ruleRepo.save(rule);
    }

    // ─── DELETE ───────────────────────────────────────────────────────
    async delete(id: number): Promise<void> {
        const result = await this.ruleRepo.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`Cancellation rule #${id} not found`);
        }
    }
}
