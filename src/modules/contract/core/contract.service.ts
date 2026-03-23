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
import { BatchUpsertPricesDto } from './dto/batch-upsert-prices.dto';
import { ContractLine } from './entities/contract-line.entity';
import { Price } from './entities/price.entity';

@Injectable()
export class ContractService {
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

        return this.contractRepo.save(contract);
    }

    // ─── Period (with overlap validation) ─────────────────────────────

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
