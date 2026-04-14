import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ContractSpo } from './entities/contract-spo.entity';
import { ContractSpoPeriod } from './entities/contract-spo-period.entity';
import { ContractSpoRoom } from './entities/contract-spo-room.entity';
import { ContractSpoArrangement } from './entities/contract-spo-arrangement.entity';
import { Contract } from '../core/entities/contract.entity';
import { TemplateSpo } from '../../catalog/spo/entities/template-spo.entity';
import { Period } from '../core/entities/period.entity';
import { ContractRoom } from '../core/entities/contract-room.entity';
import { Arrangement } from '../../hotel/entities/arrangement.entity';
import { CreateContractSpoDto } from './dto/create-contract-spo.dto';
import { UpdateContractSpoDto } from './dto/update-contract-spo.dto';
import { ImportSpoDto } from './dto/import-spo.dto';

@Injectable()
export class ContractSpoService {
    constructor(
        @InjectRepository(ContractSpo)
        private readonly contractSpoRepo: Repository<ContractSpo>,
        @InjectRepository(ContractSpoPeriod)
        private readonly spoPeriodRepo: Repository<ContractSpoPeriod>,
        @InjectRepository(ContractSpoRoom)
        private readonly spoRoomRepo: Repository<ContractSpoRoom>,
        @InjectRepository(ContractSpoArrangement)
        private readonly spoArrangementRepo: Repository<ContractSpoArrangement>,
        @InjectRepository(Contract)
        private readonly contractRepo: Repository<Contract>,
        @InjectRepository(TemplateSpo)
        private readonly templateSpoRepo: Repository<TemplateSpo>,
        @InjectRepository(Period)
        private readonly periodRepo: Repository<Period>,
        @InjectRepository(ContractRoom)
        private readonly contractRoomRepo: Repository<ContractRoom>,
        @InjectRepository(Arrangement)
        private readonly arrangementRepo: Repository<Arrangement>,
    ) { }

    private async findContractOrThrow(hotelId: number, contractId: number): Promise<Contract> {
        const contract = await this.contractRepo.findOne({ where: { id: contractId, hotelId } });
        if (!contract) throw new NotFoundException(`Contract #${contractId} not found in hotel #${hotelId}`);
        return contract;
    }

    private async findSpoOrThrow(
        hotelId: number,
        contractId: number,
        id: number,
        relations: string[] = [],
    ): Promise<ContractSpo> {
        const spo = await this.contractSpoRepo.findOne({
            where: { id, contract: { id: contractId, hotelId } },
            relations,
        });
        if (!spo) throw new NotFoundException(`ContractSpo #${id} not found in contract #${contractId}`);
        return spo;
    }

    private assertAllFound(resource: string, requestedIds: number[], foundCount: number, contractId: number): void {
        const uniqueIds = [...new Set(requestedIds)];
        if (foundCount !== uniqueIds.length) {
            throw new NotFoundException(`${resource} not found in contract #${contractId}`);
        }
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

    private async findContractRoomsOrThrow(hotelId: number, contractId: number, ids: number[]): Promise<ContractRoom[]> {
        const uniqueIds = [...new Set(ids)];
        if (uniqueIds.length === 0) return [];

        const contractRooms = await this.contractRoomRepo.find({
            where: { id: In(uniqueIds), contract: { id: contractId, hotelId } },
        });
        this.assertAllFound('ContractRoom', uniqueIds, contractRooms.length, contractId);
        return contractRooms;
    }

    private async findArrangementsOrThrow(hotelId: number, ids: number[], contractId: number): Promise<Arrangement[]> {
        const uniqueIds = [...new Set(ids)];
        if (uniqueIds.length === 0) return [];

        const arrangements = await this.arrangementRepo.find({
            where: { id: In(uniqueIds), hotelId },
        });
        this.assertAllFound('Arrangement', uniqueIds, arrangements.length, contractId);
        return arrangements;
    }

    async findAllByContract(hotelId: number, contractId: number): Promise<ContractSpo[]> {
        await this.findContractOrThrow(hotelId, contractId);
        return this.contractSpoRepo.find({
            where: { contract: { id: contractId, hotelId } },
            relations: [
                'applicablePeriods', 'applicablePeriods.period',
                'applicableContractRooms', 'applicableContractRooms.contractRoom',
                'applicableContractRooms.contractRoom.roomType',
                'applicableArrangements', 'applicableArrangements.arrangement'
            ],
        });
    }

    async createContractSpo(hotelId: number, contractId: number, dto: CreateContractSpoDto): Promise<ContractSpo> {
        const contract = await this.findContractOrThrow(hotelId, contractId);

        const periods = dto.periodIds?.length ? await this.findPeriodsOrThrow(hotelId, contractId, dto.periodIds) : [];
        const contractRooms = dto.contractRoomIds?.length ? await this.findContractRoomsOrThrow(hotelId, contractId, dto.contractRoomIds) : [];
        const arrangements = dto.arrangementIds?.length ? await this.findArrangementsOrThrow(hotelId, dto.arrangementIds, contractId) : [];

        const spo = this.contractSpoRepo.create({
            name: dto.name,
            conditionType: dto.conditionType,
            conditionValue: dto.conditionValue,
            benefitType: dto.benefitType,
            benefitValue: dto.benefitValue,
            value: dto.value ?? 0,
            applicationType: dto.applicationType,
            stayNights: dto.stayNights ?? 0,
            payNights: dto.payNights ?? 0,
            contract,
            applicablePeriods: periods.map(period => ({ period })),
            applicableContractRooms: contractRooms.map(contractRoom => ({ contractRoom })),
            applicableArrangements: arrangements.map(arrangement => ({ arrangement })),
        });

        return this.contractSpoRepo.save(spo);
    }

    async importFromTemplate(hotelId: number, contractId: number, dto: ImportSpoDto): Promise<ContractSpo> {
        const contract = await this.findContractOrThrow(hotelId, contractId);

        const template = await this.templateSpoRepo.findOne({ where: { id: dto.templateId, hotelId } });
        if (!template) throw new NotFoundException(`TemplateSpo #${dto.templateId} not found in hotel #${hotelId}`);

        const isDiscount = ['PERCENTAGE_DISCOUNT', 'FIXED_DISCOUNT'].includes(template.benefitType);
        const baseValue = (template.value && Number(template.value) !== 0) ? template.value : (isDiscount ? template.benefitValue : template.value);

        const periods = await this.periodRepo.find({ where: { contract: { id: contractId, hotelId } } });

        const spo = this.contractSpoRepo.create({
            name: template.name,
            conditionType: template.conditionType,
            conditionValue: template.conditionValue,
            benefitType: template.benefitType,
            benefitValue: template.benefitValue,
            value: baseValue ?? 0,
            applicationType: template.applicationType,
            stayNights: template.stayNights ?? 0,
            payNights: template.payNights ?? 0,
            contract,
            templateSpo: template,
            applicablePeriods: periods.map(p => ({ period: p, contractSpo: undefined })),
            applicableContractRooms: [],
            applicableArrangements: [],
        });

        return this.contractSpoRepo.save(spo);
    }

    async updateContractSpo(hotelId: number, contractId: number, id: number, dto: UpdateContractSpoDto): Promise<ContractSpo> {
        const spo = await this.findSpoOrThrow(hotelId, contractId, id, [
            'applicablePeriods', 'applicablePeriods.period',
            'applicableContractRooms', 'applicableContractRooms.contractRoom',
            'applicableArrangements', 'applicableArrangements.arrangement',
        ]);

        if (dto.applicablePeriods?.length) {
            await this.findPeriodsOrThrow(hotelId, contractId, dto.applicablePeriods.map(ap => ap.periodId));
        }
        if (dto.periodIds?.length) {
            await this.findPeriodsOrThrow(hotelId, contractId, dto.periodIds);
        }
        if (dto.contractRoomIds?.length) {
            await this.findContractRoomsOrThrow(hotelId, contractId, dto.contractRoomIds);
        }
        if (dto.arrangementIds?.length) {
            await this.findArrangementsOrThrow(hotelId, dto.arrangementIds, contractId);
        }

        if (dto.name !== undefined) spo.name = dto.name;
        if (dto.conditionType !== undefined) spo.conditionType = dto.conditionType;
        if (dto.conditionValue !== undefined) spo.conditionValue = dto.conditionValue;
        if (dto.benefitType !== undefined) spo.benefitType = dto.benefitType;
        if (dto.benefitValue !== undefined) {
            spo.benefitValue = dto.benefitValue;
            // Sync with legacy value field for simulation consistency
            spo.value = dto.benefitValue;
        }
        if (dto.value !== undefined) spo.value = dto.value;
        if (dto.applicationType !== undefined) spo.applicationType = dto.applicationType;
        if (dto.stayNights !== undefined) spo.stayNights = dto.stayNights;
        if (dto.payNights !== undefined) spo.payNights = dto.payNights;

        await this.contractSpoRepo.save(spo);

        // Pattern: Matrice 2D "Seasonal Override" avec Full Sync
        if (dto.applicablePeriods !== undefined || dto.periodIds !== undefined) {
            let applicablePeriods: Period[] = [];
            let legacyPeriods: Period[] = [];

            if (dto.applicablePeriods && dto.applicablePeriods.length > 0) {
                applicablePeriods = await this.findPeriodsOrThrow(
                    hotelId,
                    contractId,
                    dto.applicablePeriods.map(ap => ap.periodId),
                );
            } else if (dto.periodIds && dto.periodIds.length > 0) {
                legacyPeriods = await this.findPeriodsOrThrow(hotelId, contractId, dto.periodIds);
            }

            await this.spoPeriodRepo.delete({ contractSpo: { id } });

            if (dto.applicablePeriods && dto.applicablePeriods.length > 0) {
                const pivots = dto.applicablePeriods.map(ap => {
                    const period = applicablePeriods.find(p => p.id === ap.periodId);
                    if (!period) return null;
                    const pivot = new ContractSpoPeriod();
                    pivot.contractSpo = spo;
                    pivot.period = period;
                    pivot.overrideValue = ap.overrideValue ?? null;
                    return pivot;
                }).filter((p): p is ContractSpoPeriod => p !== null);

                if (pivots.length > 0) {
                    await this.spoPeriodRepo.save(pivots);
                }
            } else if (dto.periodIds && dto.periodIds.length > 0) {
                const pivots = legacyPeriods.map(period => {
                    const pivot = new ContractSpoPeriod();
                    pivot.contractSpo = spo;
                    pivot.period = period;
                    return pivot;
                });
                if (pivots.length > 0) {
                    await this.spoPeriodRepo.save(pivots);
                }
            }
        }

        if (dto.contractRoomIds !== undefined) {
            const contractRooms = dto.contractRoomIds.length > 0
                ? await this.findContractRoomsOrThrow(hotelId, contractId, dto.contractRoomIds)
                : [];

            await this.spoRoomRepo.delete({ contractSpo: { id } });

            if (dto.contractRoomIds.length > 0) {
                const pivots = contractRooms.map(contractRoom => {
                    const pivot = new ContractSpoRoom();
                    pivot.contractSpo = spo;
                    pivot.contractRoom = contractRoom;
                    return pivot;
                });
                if (pivots.length > 0) {
                    await this.spoRoomRepo.save(pivots);
                }
            }
        }

        if (dto.arrangementIds !== undefined) {
            const arrangements = dto.arrangementIds.length > 0
                ? await this.findArrangementsOrThrow(hotelId, dto.arrangementIds, contractId)
                : [];

            await this.spoArrangementRepo.delete({ contractSpo: { id } });

            if (dto.arrangementIds.length > 0) {
                const pivots = arrangements.map(arrangement => {
                    const pivot = new ContractSpoArrangement();
                    pivot.contractSpo = spo;
                    pivot.arrangement = arrangement;
                    return pivot;
                });
                if (pivots.length > 0) {
                    await this.spoArrangementRepo.save(pivots);
                }
            }
        }

        return this.contractSpoRepo.findOne({
            where: { id, contract: { id: contractId, hotelId } },
            relations: [
                'applicablePeriods', 'applicablePeriods.period',
                'applicableContractRooms', 'applicableContractRooms.contractRoom',
                'applicableArrangements', 'applicableArrangements.arrangement'
            ],
        }) as Promise<ContractSpo>;
    }

    async removeContractSpo(hotelId: number, contractId: number, id: number): Promise<void> {
        const spo = await this.findSpoOrThrow(hotelId, contractId, id);
        await this.contractSpoRepo.remove(spo);
    }
}
