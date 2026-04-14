import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Contract } from './entities/contract.entity';
import { ContractStatus } from '../../../common/constants/enums';
import { Period } from './entities/period.entity';
import { ContractRoom } from './entities/contract-room.entity';
import { Affiliate } from '../../affiliate/entities/affiliate.entity';
import { RoomType } from '../../hotel/entities/room-type.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { Arrangement } from '../../hotel/entities/arrangement.entity';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { CreatePeriodDto } from './dto/create-period.dto';
import { CreateContractRoomDto } from './dto/create-contract-room.dto';
import { DateUtil } from '../../../common/utils/date.util';
import { ContractSupplementPeriod } from '../supplement/entities/contract-supplement-period.entity';
import { ContractSupplementRoom } from '../supplement/entities/contract-supplement-room.entity';
import { ContractReductionPeriod } from '../reduction/entities/contract-reduction-period.entity';
import { ContractReductionRoom } from '../reduction/entities/contract-reduction-room.entity';
import { ContractMonoparentalRulePeriod } from '../monoparental/entities/contract-monoparental-rule-period.entity';
import { ContractMonoparentalRuleRoom } from '../monoparental/entities/contract-monoparental-rule-room.entity';
import { ContractEarlyBookingPeriod } from '../early-booking/entities/contract-early-booking-period.entity';
import { ContractEarlyBookingRoom } from '../early-booking/entities/contract-early-booking-room.entity';
import { ContractSpoPeriod } from '../spo/entities/contract-spo-period.entity';
import { ContractSpoRoom } from '../spo/entities/contract-spo-room.entity';
import { ContractSpoArrangement } from '../spo/entities/contract-spo-arrangement.entity';
import { ContractCancellationRulePeriod } from '../cancellation/entities/contract-cancellation-rule-period.entity';
import { ContractCancellationRuleRoom } from '../cancellation/entities/contract-cancellation-rule-room.entity';
import { BatchUpsertPricesDto } from './dto/batch-upsert-prices.dto';
import { ContractLine } from './entities/contract-line.entity';
import { Price } from './entities/price.entity';
import {
    ActivationDateRange,
    ActivationMissingRate,
    ActivationValidationIssue,
    ActivationValidationResult,
} from './dto/activation-validation.dto';

@Injectable()
export class ContractService {
    /* istanbul ignore next */
    constructor(
        @InjectRepository(Contract)
        private readonly contractRepo: Repository<Contract>,

        @InjectRepository(Period)
        private readonly periodRepo: Repository<Period>,

        @InjectRepository(ContractRoom)
        private readonly contractRoomRepo: Repository<ContractRoom>,

        @InjectRepository(Affiliate)
        private readonly affiliateRepo: Repository<Affiliate>,

        @InjectRepository(RoomType)
        private readonly roomTypeRepo: Repository<RoomType>,

        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,

        @InjectRepository(Arrangement)
        private readonly arrangementRepo: Repository<Arrangement>,

        private readonly dataSource: DataSource,
    ) { }

    // ─── Contract ─────────────────────────────────────────────────────

    async createContract(hotelId: number, dto: CreateContractDto): Promise<Contract> {
        const start = new Date(dto.startDate);
        const end = new Date(dto.endDate);

        if (start >= end) {
            throw new BadRequestException('startDate must be strictly before endDate');
        }

        const hotel = await this.hotelRepo.findOne({ where: { id: hotelId } });
        if (!hotel) {
            throw new NotFoundException(`Hotel #${hotelId} not found`);
        }

        // Verify all affiliates belong to this hotel
        const affiliates: Affiliate[] = [];
        for (const affId of dto.affiliateIds) {
            const affiliate = await this.affiliateRepo.findOne({
                where: { id: affId, hotelId },
            });
            if (!affiliate) {
                throw new NotFoundException(`Affiliate #${affId} not found in hotel #${hotelId}`);
            }
            affiliates.push(affiliate);
        }

        // Verify the base arrangement if provided
        if (dto.baseArrangementId) {
            const arr = await this.arrangementRepo.findOne({ where: { id: dto.baseArrangementId, hotelId } });
            if (!arr) {
                throw new NotFoundException(`Arrangement #${dto.baseArrangementId} not found in hotel #${hotelId}`);
            }
        }

        const contract = this.contractRepo.create({
            name: dto.name,
            startDate: start,
            endDate: end,
            currency: dto.currency,
            affiliates,
            hotel,
            baseArrangementId: dto.baseArrangementId,
        });

        return this.contractRepo.save(contract);
    }

    async findAll(hotelId: number): Promise<Contract[]> {
        return this.contractRepo.find({
            where: { hotelId },
            relations: ['affiliates'],
        });
    }

    async getContractDetails(hotelId: number, id: number): Promise<Contract> {
        const contract = await this.contractRepo.findOne({
            where: { id, hotelId },
            relations: ['affiliates', 'periods', 'contractRooms', 'contractRooms.roomType', 'baseArrangement'],
        });

        if (!contract) {
            throw new NotFoundException(`Contract #${id} not found in hotel #${hotelId}`);
        }

        return contract;
    }

    async updateContract(hotelId: number, id: number, dto: UpdateContractDto): Promise<Contract> {
        const contract = await this.contractRepo.findOne({
            where: { id, hotelId },
            relations: ['affiliates'],
        });
        if (!contract) {
            throw new NotFoundException(`Contract #${id} not found in hotel #${hotelId}`);
        }

        if (dto.name !== undefined) contract.name = dto.name;
        if (dto.currency !== undefined) contract.currency = dto.currency;
        if (dto.status !== undefined) contract.status = dto.status as ContractStatus;
        if (dto.startDate !== undefined) contract.startDate = new Date(dto.startDate);
        if (dto.endDate !== undefined) contract.endDate = new Date(dto.endDate);
        if (dto.paymentCondition !== undefined) contract.paymentCondition = dto.paymentCondition;
        if (dto.depositAmount !== undefined) contract.depositAmount = dto.depositAmount;
        if (dto.creditDays !== undefined) contract.creditDays = dto.creditDays;
        if (dto.paymentMethods !== undefined) contract.paymentMethods = dto.paymentMethods;

        if (dto.baseArrangementId !== undefined) {
            if (dto.baseArrangementId === null) {
                contract.baseArrangementId = null;
                contract.baseArrangement = null;
            } else {
                const arr = await this.arrangementRepo.findOne({ where: { id: dto.baseArrangementId, hotelId } });
                if (!arr) {
                    // Normally throw, but doing silently to protect robust system or throw
                    throw new NotFoundException(`Arrangement #${dto.baseArrangementId} not found in hotel #${hotelId}`);
                }
                contract.baseArrangementId = dto.baseArrangementId;
            }
        }

        if (dto.affiliateIds !== undefined) {
            const affiliates: Affiliate[] = [];
            for (const affId of dto.affiliateIds) {
                const aff = await this.affiliateRepo.findOne({ where: { id: affId, hotelId } });
                if (!aff) throw new NotFoundException(`Affiliate #${affId} not found in hotel #${hotelId}`);
                affiliates.push(aff);
            }
            contract.affiliates = affiliates;
        }

        if (contract.status === ContractStatus.ACTIVE) {
            const validation = await this.buildActivationValidation(hotelId, contract);
            if (!validation.isValid) {
                throw new BadRequestException({
                    message: 'Contract activation validation failed',
                    validation,
                });
            }
        }

        return this.contractRepo.save(contract);
    }

    async validateActivation(hotelId: number, id: number): Promise<ActivationValidationResult> {
        const contract = await this.contractRepo.findOne({
            where: { id, hotelId },
            relations: ['affiliates', 'baseArrangement'],
        });
        if (!contract) {
            throw new NotFoundException(`Contract #${id} not found in hotel #${hotelId}`);
        }

        return this.buildActivationValidation(hotelId, contract);
    }

    private async buildActivationValidation(
        hotelId: number,
        contract: Contract,
    ): Promise<ActivationValidationResult> {
        const errors: ActivationValidationIssue[] = [];
        const warnings: ActivationValidationIssue[] = [];
        const uncoveredDateRanges: ActivationDateRange[] = [];
        const missingRates: ActivationMissingRate[] = [];
        const invalidTargets: ActivationValidationIssue[] = [];

        const contractStart = this.toDateOnly(contract.startDate);
        const contractEnd = this.toDateOnly(contract.endDate);

        if (!contractStart || !contractEnd || contractStart.getTime() >= contractEnd.getTime()) {
            errors.push({
                code: 'INVALID_CONTRACT_DATES',
                message: 'Contract start date must be strictly before contract end date',
                details: {
                    startDate: this.formatDate(contract.startDate),
                    endDate: this.formatDate(contract.endDate),
                },
            });
        }

        if (!contract.affiliates || contract.affiliates.length === 0) {
            errors.push({
                code: 'MISSING_AFFILIATES',
                message: 'Contract must have at least one affiliate / tour operator before activation',
            });
        }

        const periods = await this.periodRepo.find({
            where: { contract: { id: contract.id, hotelId } },
            order: { startDate: 'ASC' },
        });

        if (periods.length === 0) {
            errors.push({ code: 'MISSING_PERIODS', message: 'Contract has no periods' });
        } else if (contractStart && contractEnd) {
            this.validatePeriods(contract, periods, contractStart, contractEnd, errors, uncoveredDateRanges);
        }

        const contractRooms = await this.contractRoomRepo.find({
            where: { contract: { id: contract.id, hotelId } },
            relations: ['roomType'],
            order: { id: 'ASC' },
        });

        if (contractRooms.length === 0) {
            errors.push({ code: 'MISSING_ROOMS', message: 'Contract has no contract rooms' });
        }

        for (const contractRoom of contractRooms) {
            if (!contractRoom.roomType || contractRoom.roomType.hotelId !== hotelId) {
                const issue = {
                    code: 'INVALID_ROOM_TARGET',
                    message: `Contract room #${contractRoom.id} is linked to a room type outside hotel #${hotelId}`,
                    details: { contractRoomId: contractRoom.id, roomTypeId: contractRoom.roomType?.id ?? null },
                };
                errors.push(issue);
                invalidTargets.push(issue);
            }
        }

        const requiredArrangement = await this.resolveRequiredArrangement(hotelId, contract, errors, invalidTargets);

        if (periods.length > 0 && contractRooms.length > 0 && requiredArrangement) {
            await this.validateRequiredRates(contract.id, hotelId, periods, contractRooms, requiredArrangement, errors, missingRates);
        }

        await this.validateRuleTargets(contract.id, hotelId, errors, invalidTargets);

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            summary: {
                missingPeriods: periods.length === 0,
                uncoveredDateRanges,
                missingRooms: contractRooms.length === 0,
                missingRates,
                invalidTargets,
            },
        };
    }

    private validatePeriods(
        contract: Contract,
        periods: Period[],
        contractStart: Date,
        contractEnd: Date,
        errors: ActivationValidationIssue[],
        uncoveredDateRanges: ActivationDateRange[],
    ): void {
        let expectedStart = contractStart;
        let previousEnd: Date | null = null;

        for (const period of periods) {
            const start = this.toDateOnly(period.startDate);
            const end = this.toDateOnly(period.endDate);

            if (!start || !end || start.getTime() >= end.getTime()) {
                errors.push({
                    code: 'INVALID_PERIOD_DATES',
                    message: `Period "${period.name}" must have a start date strictly before its end date`,
                    details: { periodId: period.id, periodName: period.name },
                });
                continue;
            }

            if (start.getTime() < contractStart.getTime() || end.getTime() > contractEnd.getTime()) {
                errors.push({
                    code: 'PERIOD_OUTSIDE_CONTRACT_RANGE',
                    message: `Period "${period.name}" is outside the contract date range`,
                    details: {
                        periodId: period.id,
                        periodName: period.name,
                        periodStartDate: this.formatDate(start),
                        periodEndDate: this.formatDate(end),
                        contractStartDate: this.formatDate(contract.startDate),
                        contractEndDate: this.formatDate(contract.endDate),
                    },
                });
            }

            if (previousEnd && start.getTime() <= previousEnd.getTime()) {
                errors.push({
                    code: 'OVERLAPPING_PERIODS',
                    message: `Period "${period.name}" overlaps another contract period`,
                    details: { periodId: period.id, periodName: period.name },
                });
            }

            if (start.getTime() > expectedStart.getTime()) {
                const gapEnd = this.addDays(start, -1);
                const gap = { startDate: this.formatDate(expectedStart), endDate: this.formatDate(gapEnd) };
                uncoveredDateRanges.push(gap);
                errors.push({
                    code: 'UNCOVERED_DATE_RANGE',
                    message: `Contract periods do not fully cover the date range ${gap.startDate} to ${gap.endDate}`,
                    details: gap,
                });
            }

            const nextExpectedStart = this.addDays(end, 1);
            if (nextExpectedStart.getTime() > expectedStart.getTime()) expectedStart = nextExpectedStart;
            previousEnd = !previousEnd || end.getTime() > previousEnd.getTime() ? end : previousEnd;
        }

        if (expectedStart.getTime() <= contractEnd.getTime()) {
            const gap = { startDate: this.formatDate(expectedStart), endDate: this.formatDate(contractEnd) };
            uncoveredDateRanges.push(gap);
            errors.push({
                code: 'UNCOVERED_DATE_RANGE',
                message: `Contract periods do not fully cover the date range ${gap.startDate} to ${gap.endDate}`,
                details: gap,
            });
        }
    }

    private async resolveRequiredArrangement(
        hotelId: number,
        contract: Contract,
        errors: ActivationValidationIssue[],
        invalidTargets: ActivationValidationIssue[],
    ): Promise<Arrangement | null> {
        if (!contract.baseArrangementId) {
            errors.push({
                code: 'MISSING_BASE_ARRANGEMENT',
                message: 'Contract must define a base arrangement / board before activation',
            });
            return null;
        }

        const arrangement = await this.arrangementRepo.findOne({
            where: { id: contract.baseArrangementId, hotelId },
        });
        if (!arrangement) {
            const issue = {
                code: 'INVALID_BASE_ARRANGEMENT',
                message: `Arrangement #${contract.baseArrangementId} does not belong to hotel #${hotelId}`,
                details: { arrangementId: contract.baseArrangementId, hotelId },
            };
            errors.push(issue);
            invalidTargets.push(issue);
            return null;
        }

        return arrangement;
    }

    private async validateRequiredRates(
        contractId: number,
        hotelId: number,
        periods: Period[],
        contractRooms: ContractRoom[],
        arrangement: Arrangement,
        errors: ActivationValidationIssue[],
        missingRates: ActivationMissingRate[],
    ): Promise<void> {
        const lines = await this.dataSource.getRepository(ContractLine).find({
            where: {
                period: { contract: { id: contractId, hotelId } },
                contractRoom: { contract: { id: contractId, hotelId } },
            },
            relations: ['period', 'contractRoom', 'contractRoom.roomType', 'prices', 'prices.arrangement'],
        });

        const lineByCell = new Map<string, ContractLine>();
        for (const line of lines) {
            if (line.period?.id && line.contractRoom?.id) {
                lineByCell.set(`${line.period.id}:${line.contractRoom.id}`, line);
            }
        }

        for (const period of periods) {
            for (const contractRoom of contractRooms) {
                const line = lineByCell.get(`${period.id}:${contractRoom.id}`);
                const price = line?.prices?.find((p) => p.arrangement?.id === arrangement.id);
                const amount = price?.amount === undefined || price?.amount === null ? NaN : Number(price.amount);

                if (!line || !line.isContracted || !price || !Number.isFinite(amount) || amount < 0) {
                    missingRates.push({
                        periodId: period.id,
                        periodName: period.name,
                        contractRoomId: contractRoom.id,
                        roomName: contractRoom.roomType?.name ?? `ContractRoom #${contractRoom.id}`,
                        arrangementId: arrangement.id,
                        arrangementName: arrangement.name,
                    });
                }
            }
        }

        for (const missingRate of missingRates.slice(0, 50)) {
            errors.push({
                code: 'MISSING_RATE',
                message: `Missing rates for ${missingRate.periodName} / ${missingRate.roomName} / ${missingRate.arrangementName}`,
                details: missingRate,
            });
        }

        if (missingRates.length > 50) {
            errors.push({
                code: 'MISSING_RATE_LIMIT_REACHED',
                message: `${missingRates.length - 50} additional required rate cells are missing`,
                details: { totalMissingRates: missingRates.length },
            });
        }
    }

    private async validateRuleTargets(
        contractId: number,
        hotelId: number,
        errors: ActivationValidationIssue[],
        invalidTargets: ActivationValidationIssue[],
    ): Promise<void> {
        await this.validateRoomTargetJunction(this.dataSource.getRepository(ContractSupplementRoom), 'contractSupplement', contractId, hotelId, 'INVALID_SUPPLEMENT_ROOM_TARGET', errors, invalidTargets);
        await this.validatePeriodTargetJunction(this.dataSource.getRepository(ContractSupplementPeriod), 'contractSupplement', contractId, hotelId, 'INVALID_SUPPLEMENT_PERIOD_TARGET', errors, invalidTargets);
        await this.validateRoomTargetJunction(this.dataSource.getRepository(ContractReductionRoom), 'contractReduction', contractId, hotelId, 'INVALID_REDUCTION_ROOM_TARGET', errors, invalidTargets);
        await this.validatePeriodTargetJunction(this.dataSource.getRepository(ContractReductionPeriod), 'contractReduction', contractId, hotelId, 'INVALID_REDUCTION_PERIOD_TARGET', errors, invalidTargets);
        await this.validateRoomTargetJunction(this.dataSource.getRepository(ContractMonoparentalRuleRoom), 'contractMonoparentalRule', contractId, hotelId, 'INVALID_MONOPARENTAL_ROOM_TARGET', errors, invalidTargets);
        await this.validatePeriodTargetJunction(this.dataSource.getRepository(ContractMonoparentalRulePeriod), 'contractMonoparentalRule', contractId, hotelId, 'INVALID_MONOPARENTAL_PERIOD_TARGET', errors, invalidTargets);
        await this.validateRoomTargetJunction(this.dataSource.getRepository(ContractEarlyBookingRoom), 'contractEarlyBooking', contractId, hotelId, 'INVALID_EARLY_BOOKING_ROOM_TARGET', errors, invalidTargets);
        await this.validatePeriodTargetJunction(this.dataSource.getRepository(ContractEarlyBookingPeriod), 'contractEarlyBooking', contractId, hotelId, 'INVALID_EARLY_BOOKING_PERIOD_TARGET', errors, invalidTargets);
        await this.validateRoomTargetJunction(this.dataSource.getRepository(ContractSpoRoom), 'contractSpo', contractId, hotelId, 'INVALID_SPO_ROOM_TARGET', errors, invalidTargets);
        await this.validatePeriodTargetJunction(this.dataSource.getRepository(ContractSpoPeriod), 'contractSpo', contractId, hotelId, 'INVALID_SPO_PERIOD_TARGET', errors, invalidTargets);
        await this.validateArrangementTargetJunction(this.dataSource.getRepository(ContractSpoArrangement), contractId, hotelId, errors, invalidTargets);
        await this.validateRoomTargetJunction(this.dataSource.getRepository(ContractCancellationRuleRoom), 'contractCancellationRule', contractId, hotelId, 'INVALID_CANCELLATION_ROOM_TARGET', errors, invalidTargets);
        await this.validatePeriodTargetJunction(this.dataSource.getRepository(ContractCancellationRulePeriod), 'contractCancellationRule', contractId, hotelId, 'INVALID_CANCELLATION_PERIOD_TARGET', errors, invalidTargets);
    }

    // ─── Period (with overlap validation) ─────────────────────────────

    private async validateRoomTargetJunction(
        repo: Repository<any>,
        ruleRelation: string,
        contractId: number,
        hotelId: number,
        code: string,
        errors: ActivationValidationIssue[],
        invalidTargets: ActivationValidationIssue[],
    ): Promise<void> {
        const rows = await repo.find({
            where: { [ruleRelation]: { contract: { id: contractId, hotelId } } } as any,
            relations: [ruleRelation, `${ruleRelation}.contract`, 'contractRoom', 'contractRoom.contract'],
        });

        for (const row of rows) {
            if (!row.contractRoom?.contract || row.contractRoom.contract.id !== contractId || row.contractRoom.contract.hotelId !== hotelId) {
                const issue = {
                    code,
                    message: `A ${ruleRelation} room target points outside contract #${contractId}`,
                    details: { junctionId: row.id, contractRoomId: row.contractRoom?.id ?? null },
                };
                errors.push(issue);
                invalidTargets.push(issue);
            }
        }
    }

    private async validatePeriodTargetJunction(
        repo: Repository<any>,
        ruleRelation: string,
        contractId: number,
        hotelId: number,
        code: string,
        errors: ActivationValidationIssue[],
        invalidTargets: ActivationValidationIssue[],
    ): Promise<void> {
        const rows = await repo.find({
            where: { [ruleRelation]: { contract: { id: contractId, hotelId } } } as any,
            relations: [ruleRelation, `${ruleRelation}.contract`, 'period', 'period.contract'],
        });

        for (const row of rows) {
            if (!row.period?.contract || row.period.contract.id !== contractId || row.period.contract.hotelId !== hotelId) {
                const issue = {
                    code,
                    message: `A ${ruleRelation} period target points outside contract #${contractId}`,
                    details: { junctionId: row.id, periodId: row.period?.id ?? null },
                };
                errors.push(issue);
                invalidTargets.push(issue);
            }
        }
    }

    private async validateArrangementTargetJunction(
        repo: Repository<ContractSpoArrangement>,
        contractId: number,
        hotelId: number,
        errors: ActivationValidationIssue[],
        invalidTargets: ActivationValidationIssue[],
    ): Promise<void> {
        const rows = await repo.find({
            where: { contractSpo: { contract: { id: contractId, hotelId } } },
            relations: ['contractSpo', 'contractSpo.contract', 'arrangement'],
        });

        for (const row of rows) {
            if (!row.arrangement || row.arrangement.hotelId !== hotelId) {
                const issue = {
                    code: 'INVALID_SPO_ARRANGEMENT_TARGET',
                    message: `A SPO arrangement target points outside hotel #${hotelId}`,
                    details: { junctionId: row.id, arrangementId: row.arrangement?.id ?? null },
                };
                errors.push(issue);
                invalidTargets.push(issue);
            }
        }
    }

    private toDateOnly(value: Date | string | null | undefined): Date | null {
        if (!value) return null;
        const dateValue = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(dateValue.getTime())) return null;
        return new Date(Date.UTC(dateValue.getUTCFullYear(), dateValue.getUTCMonth(), dateValue.getUTCDate()));
    }

    private addDays(date: Date, days: number): Date {
        const next = new Date(date);
        next.setUTCDate(next.getUTCDate() + days);
        return next;
    }

    private formatDate(value: Date | string | null | undefined): string {
        const date = this.toDateOnly(value);
        return date ? date.toISOString().slice(0, 10) : 'invalid-date';
    }

    async addPeriod(hotelId: number, contractId: number, dto: CreatePeriodDto): Promise<Period> {
        const contract = await this.contractRepo.findOne({
            where: { id: contractId, hotelId },
            relations: ['periods'],
        });

        if (!contract) {
            throw new NotFoundException(`Contract #${contractId} not found in hotel #${hotelId}`);
        }

        const newStart = new Date(dto.startDate);
        const newEnd = new Date(dto.endDate);

        if (newStart >= newEnd) {
            throw new BadRequestException('startDate must be strictly before endDate');
        }

        // Validate that the period falls within the contract date range
        if (newStart < contract.startDate || newEnd > contract.endDate) {
            throw new BadRequestException(
                'Period dates must fall within the contract date range ' +
                `(${contract.startDate.toISOString()} – ${contract.endDate.toISOString()})`,
            );
        }

        // Check for overlaps with existing periods
        for (const existing of contract.periods) {
            if (DateUtil.isOverlap(newStart, newEnd, existing.startDate, existing.endDate)) {
                throw new BadRequestException(
                    `Period "${dto.name}" overlaps with existing period "${existing.name}" ` +
                    `(${existing.startDate.toISOString()} – ${existing.endDate.toISOString()})`,
                );
            }
        }

        let period = this.periodRepo.create({
            name: dto.name,
            startDate: newStart,
            endDate: newEnd,
            contract,
        });

        period = await this.periodRepo.save(period);

        // Re-number all periods based on chronological order
        const allPeriods = [...contract.periods, period].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        for (let i = 0; i < allPeriods.length; i++) {
            if (allPeriods[i].name !== `Période ${i + 1}`) {
                allPeriods[i].name = `Période ${i + 1}`;
                await this.periodRepo.save(allPeriods[i]);
            }
        }

        // Return the saved period specifically (in case it needed to be returned by id)
        const finalPeriod = allPeriods.find(p => p.id === period.id);
        return finalPeriod || period;
    }

    // ─── Contract Room (with duplicate guard) ─────────────────────────

    async addContractRoom(hotelId: number, contractId: number, dto: CreateContractRoomDto): Promise<ContractRoom> {
        const contract = await this.contractRepo.findOne({
            where: { id: contractId, hotelId },
            relations: ['contractRooms', 'contractRooms.roomType'],
        });

        if (!contract) {
            throw new NotFoundException(`Contract #${contractId} not found in hotel #${hotelId}`);
        }

        // Verify the roomType belongs to this hotel
        const roomType = await this.roomTypeRepo.findOne({
            where: { id: dto.roomTypeId, hotelId },
        });

        if (!roomType) {
            throw new NotFoundException(`RoomType #${dto.roomTypeId} not found in hotel #${hotelId}`);
        }

        // Guard: prevent duplicate roomType mapping within the same contract
        const alreadyMapped = contract.contractRooms.some(
            (cr) => cr.roomType.id === dto.roomTypeId,
        );

        if (alreadyMapped) {
            throw new BadRequestException(
                `RoomType #${dto.roomTypeId} is already mapped to Contract #${contractId}`,
            );
        }

        const contractRoom = this.contractRoomRepo.create({
            reference: dto.reference || undefined,
            description: dto.description,
            contract,
            roomType,
        });

        return this.contractRoomRepo.save(contractRoom);
    }

    // ─── Delete Period (with junction cleanup) ────────────────────────

    async deletePeriod(hotelId: number, contractId: number, periodId: number): Promise<void> {
        const contract = await this.contractRepo.findOne({
            where: { id: contractId, hotelId },
            relations: ['periods'],
        });
        if (!contract) {
            throw new NotFoundException(`Contract #${contractId} not found in hotel #${hotelId}`);
        }

        const period = contract.periods.find(p => Number(p.id) === Number(periodId));
        if (!period) {
            throw new NotFoundException(`Period #${periodId} not found in contract #${contractId}`);
        }

        // Manually clean up all junction table references to this period
        await this.dataSource.getRepository(ContractSupplementPeriod).delete({ period: { id: periodId } });
        await this.dataSource.getRepository(ContractReductionPeriod).delete({ period: { id: periodId } });
        await this.dataSource.getRepository(ContractMonoparentalRulePeriod).delete({ period: { id: periodId } });
        await this.dataSource.getRepository(ContractEarlyBookingPeriod).delete({ period: { id: periodId } });

        // Clean up ContractLines and Prices
        const contractLines = await this.dataSource.getRepository(ContractLine).find({ where: { period: { id: periodId } } });
        if (contractLines.length > 0) {
            const lineIds = contractLines.map(cl => cl.id);
            await this.dataSource.getRepository(Price).delete({ contractLine: { id: In(lineIds) } });
            await this.dataSource.getRepository(ContractLine).delete(lineIds);
        }

        await this.periodRepo.remove(period);

        // Fetch remaining periods directly from DB to ensure accurate ordering and state
        const remainingPeriods = await this.periodRepo.find({
            where: { contract: { id: contractId } },
            order: { startDate: 'ASC' },
        });

        for (let i = 0; i < remainingPeriods.length; i++) {
            const newName = `Période ${i + 1}`;
            if (remainingPeriods[i].name !== newName && remainingPeriods[i].id) {
                remainingPeriods[i].name = newName;
                await this.periodRepo.update(remainingPeriods[i].id, { name: newName });
            }
        }
    }

    // ─── Delete Contract Room (with junction cleanup) ─────────────────

    async deleteContractRoom(hotelId: number, contractId: number, roomId: number): Promise<void> {
        const contract = await this.contractRepo.findOne({
            where: { id: contractId, hotelId },
        });
        if (!contract) {
            throw new NotFoundException(`Contract #${contractId} not found in hotel #${hotelId}`);
        }

        const room = await this.contractRoomRepo.findOne({
            where: { id: roomId, contract: { id: contractId } },
        });
        if (!room) {
            throw new NotFoundException(`ContractRoom #${roomId} not found in contract #${contractId}`);
        }

        // Manually clean up all junction table references to this room
        await this.dataSource.getRepository(ContractSupplementRoom).delete({ contractRoom: { id: roomId } });
        await this.dataSource.getRepository(ContractReductionRoom).delete({ contractRoom: { id: roomId } });
        await this.dataSource.getRepository(ContractMonoparentalRuleRoom).delete({ contractRoom: { id: roomId } });
        await this.dataSource.getRepository(ContractEarlyBookingRoom).delete({ contractRoom: { id: roomId } });

        // Clean up ContractLines and Prices
        const contractLines = await this.dataSource.getRepository(ContractLine).find({ where: { contractRoom: { id: roomId } } });
        if (contractLines.length > 0) {
            const lineIds = contractLines.map(cl => cl.id);
            await this.dataSource.getRepository(Price).delete({ contractLine: { id: In(lineIds) } });
            await this.dataSource.getRepository(ContractLine).delete(lineIds);
        }

        await this.contractRoomRepo.remove(room);
    }

    // ─── Prices (Rates Grid) ──────────────────────────────────────────

    async getContractPrices(hotelId: number, id: number) {
        const contract = await this.contractRepo.findOne({
            where: { id, hotelId },
            relations: ['periods', 'contractRooms'],
        });

        if (!contract) {
            throw new NotFoundException(`Contract #${id} not found in hotel #${hotelId}`);
        }

        const contractLines = await this.dataSource.getRepository(ContractLine)
            .createQueryBuilder('contractLine')
            .leftJoinAndSelect('contractLine.period', 'period')
            .leftJoinAndSelect('contractLine.contractRoom', 'contractRoom')
            .leftJoinAndSelect('contractRoom.roomType', 'roomType')
            .leftJoinAndSelect('contractLine.prices', 'prices')
            .leftJoinAndSelect('prices.arrangement', 'arrangement')
            .where('period.contractId = :contractId', { contractId: id })
            .getMany();

        // Strip prices whose arrangement has been deleted (leftJoin returns null for deleted relations)
        for (const line of contractLines) {
            if (line.prices) {
                line.prices = line.prices.filter(p => p.arrangement != null);
            }
        }

        return contractLines;
    }

    async batchUpsertPrices(hotelId: number, id: number, dto: BatchUpsertPricesDto) {
        const contract = await this.contractRepo.findOne({
            where: { id, hotelId },
            relations: ['periods', 'contractRooms'],
        });

        if (!contract) {
            throw new NotFoundException(`Contract #${id} not found in hotel #${hotelId}`);
        }

        const validPeriodIds = new Set(contract.periods.map(p => p.id));
        const validRoomIds = new Set(contract.contractRooms.map(r => r.id));
        const requestedArrangementIds = [
            ...new Set(dto.cells.flatMap(cell => cell.prices.map(price => price.arrangementId))),
        ];

        if (requestedArrangementIds.length > 0) {
            const arrangements = await this.arrangementRepo.find({
                where: { id: In(requestedArrangementIds), hotelId },
            });
            if (arrangements.length !== requestedArrangementIds.length) {
                throw new NotFoundException(`Arrangement not found in hotel #${hotelId}`);
            }
        }

        await this.dataSource.transaction(async (manager) => {
            const contractLineRepo = manager.getRepository(ContractLine);
            const priceRepo = manager.getRepository(Price);

            for (const cell of dto.cells) {
                if (!validPeriodIds.has(cell.periodId)) {
                    throw new BadRequestException(`Period #${cell.periodId} does not belong to Contract #${id}`);
                }
                if (!validRoomIds.has(cell.contractRoomId)) {
                    throw new BadRequestException(`ContractRoom #${cell.contractRoomId} does not belong to Contract #${id}`);
                }

                // Find or Create ContractLine (the Period x Room intersection)
                let contractLine = await contractLineRepo.findOne({
                    where: {
                        period: { id: cell.periodId },
                        contractRoom: { id: cell.contractRoomId },
                    },
                });

                if (!contractLine) {
                    contractLine = contractLineRepo.create({
                        period: { id: cell.periodId },
                        contractRoom: { id: cell.contractRoomId },
                        isContracted: cell.isContracted,
                        allotment: cell.allotment ?? 0,
                    });
                } else {
                    contractLine.isContracted = cell.isContracted;
                    contractLine.allotment = cell.allotment ?? contractLine.allotment;
                }
                contractLine = await contractLineRepo.save(contractLine);

                // If not contracted, skip price rows
                if (!cell.isContracted) continue;

                for (const priceItem of cell.prices) {
                    // Find or Update Price for this arrangement
                    let price = await priceRepo.findOne({
                        where: {
                            contractLine: { id: contractLine.id },
                            arrangement: { id: priceItem.arrangementId },
                        },
                    });

                    if (!price) {
                        price = priceRepo.create({
                            contractLine: { id: contractLine.id },
                            arrangement: { id: priceItem.arrangementId },
                            amount: priceItem.amount,
                            currency: contract.currency,
                            minStay: priceItem.minStay,
                            releaseDays: priceItem.releaseDays,
                        });
                    } else {
                        price.amount = priceItem.amount;
                        price.currency = contract.currency;
                        price.minStay = priceItem.minStay;
                        price.releaseDays = priceItem.releaseDays;
                    }
                    await priceRepo.save(price);
                }
            }
        });

        return { success: true, message: `${dto.cells.length} cells processed.` };
    }
}
