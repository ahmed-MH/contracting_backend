import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ContractCancellationRule } from './entities/contract-cancellation-rule.entity';
import { ContractCancellationRulePeriod } from './entities/contract-cancellation-rule-period.entity';
import { ContractCancellationRuleRoom } from './entities/contract-cancellation-rule-room.entity';
import { TemplateCancellationRule } from '../../catalog/cancellation/entities/template-cancellation-rule.entity';
import { Period } from '../core/entities/period.entity';
import { ContractRoom } from '../core/entities/contract-room.entity';
import { Contract } from '../core/entities/contract.entity';
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

        @InjectRepository(Contract)
        private readonly contractRepo: Repository<Contract>,
    ) { }

    private async findContractOrThrow(hotelId: number, contractId: number): Promise<Contract> {
        const contract = await this.contractRepo.findOne({ where: { id: contractId, hotelId } });
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
    ): Promise<ContractCancellationRule> {
        const rule = await this.ruleRepo.findOne({
            where: { id, contract: { id: contractId, hotelId } },
            relations,
        });
        if (!rule) {
            throw new NotFoundException(`Cancellation rule #${id} not found in contract #${contractId}`);
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

        const periods = await this.contractPeriodRepo.find({
            where: { id: In(uniqueIds), contract: { id: contractId, hotelId } },
        });
        this.assertAllFound('Period', uniqueIds, periods.length, contractId);
        return periods;
    }

    // ─── READ ─────────────────────────────────────────────────────────
    async findAllByContract(hotelId: number, contractId: number): Promise<ContractCancellationRule[]> {
        await this.findContractOrThrow(hotelId, contractId);
        return this.ruleRepo.find({
            where: { contract: { id: contractId, hotelId } },
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
    async create(hotelId: number, contractId: number, dto: CreateContractCancellationRuleDto): Promise<ContractCancellationRule> {
        const { contractRoomIds, periodIds, ...ruleData } = dto;
        await this.findContractOrThrow(hotelId, contractId);
        const rooms = contractRoomIds?.length
            ? await this.findContractRoomsOrThrow(hotelId, contractId, contractRoomIds)
            : [];
        const periods = periodIds?.length
            ? await this.findPeriodsOrThrow(hotelId, contractId, periodIds)
            : [];

        const rule = this.ruleRepo.create({ ...ruleData, contractId });
        const savedRule = await this.ruleRepo.save(rule);

        if (contractRoomIds?.length > 0) {
            const roomJunctions = rooms.map(room =>
                this.roomRepo.create({ contractCancellationRule: savedRule, contractRoom: room }),
            );
            await this.roomRepo.save(roomJunctions);
        }

        if (periodIds && periodIds.length > 0) {
            const periodJunctions = periods.map(period =>
                this.periodRepo.create({ contractCancellationRule: savedRule, period }),
            );
            await this.periodRepo.save(periodJunctions);
        }

        return savedRule;
    }

    // ─── UPDATE ───────────────────────────────────────────────────────
    async update(hotelId: number, contractId: number, id: number, dto: UpdateContractCancellationRuleDto): Promise<ContractCancellationRule> {
        const rule = await this.findRuleOrThrow(hotelId, contractId, id, [
            'applicablePeriods',
            'applicableRooms',
        ]);

        // ── Scalar fields ──────────────────────────────────────────────
        if (dto.applicablePeriods?.length) {
            await this.findPeriodsOrThrow(hotelId, contractId, dto.applicablePeriods.map(ap => Number(ap.periodId)));
        }
        if (dto.contractRoomIds?.length) {
            await this.findContractRoomsOrThrow(hotelId, contractId, dto.contractRoomIds);
        }

        const { applicablePeriods, contractRoomIds, ...ruleData } = dto;
        Object.assign(rule, ruleData);
        await this.ruleRepo.save(rule);

        // ── Periods — Drop & Replace (mirror of ReductionService) ──────
        if (applicablePeriods !== undefined) {
            const scopedPeriods = applicablePeriods.length > 0
                ? await this.findPeriodsOrThrow(hotelId, contractId, applicablePeriods.map(ap => Number(ap.periodId)))
                : [];
            // Hard delete via injected repository — resolves FK correctly
            await this.periodRepo.delete({ contractCancellationRule: { id } });

            if (applicablePeriods.length > 0) {
                const periods = scopedPeriods;

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
            const scopedRooms = contractRoomIds.length > 0
                ? await this.findContractRoomsOrThrow(hotelId, contractId, contractRoomIds)
                : [];
            await this.roomRepo.delete({ contractCancellationRule: { id } });

            if (contractRoomIds.length > 0) {
                const rooms = scopedRooms;
                const junctions = rooms.map(room =>
                    this.roomRepo.create({ contractCancellationRule: rule, contractRoom: room }),
                );
                await this.roomRepo.save(junctions);
            }
        }

        // ── Reload with fresh relations ────────────────────────────────
        return this.ruleRepo.findOne({
            where: { id, contract: { id: contractId, hotelId } },
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
    async importFromTemplate(hotelId: number, contractId: number, dto: ImportCancellationRuleDto): Promise<ContractCancellationRule> {
        await this.findContractOrThrow(hotelId, contractId);

        const template = await this.templateRepo.findOne({ where: { id: dto.templateId, hotelId } });
        if (!template) throw new NotFoundException(`TemplateCancellationRule #${dto.templateId} not found in hotel #${hotelId}`);

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

        const savedRule = await this.ruleRepo.save(rule);

        const periods = await this.contractPeriodRepo.find({ where: { contract: { id: contractId, hotelId } } });
        const periodJunctions = periods.map(period => this.periodRepo.create({ contractCancellationRule: savedRule, period }));
        await this.periodRepo.save(periodJunctions);

        return savedRule;
    }

    // ─── DELETE ───────────────────────────────────────────────────────
    async delete(hotelId: number, contractId: number, id: number): Promise<void> {
        const rule = await this.findRuleOrThrow(hotelId, contractId, id);
        await this.ruleRepo.remove(rule);
    }
}
