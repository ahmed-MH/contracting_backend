import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { Contract } from '../contract/core/entities/contract.entity';
import { ContractLine } from '../contract/core/entities/contract-line.entity';
import { ContractReduction } from '../contract/reduction/entities/contract-reduction.entity';
import { ContractMonoparentalRule } from '../contract/monoparental/entities/contract-monoparental-rule.entity';
import { ContractEarlyBooking } from '../contract/early-booking/entities/contract-early-booking.entity';
import { ContractSpo } from '../contract/spo/entities/contract-spo.entity';
import { ContractSupplement } from '../contract/supplement/entities/contract-supplement.entity';
import { AffiliateEmailSpo } from '../affiliate/email-spo/entities/affiliate-email-spo.entity';
import { SimulationRequestDto, RoomingItemDto } from './dto/simulation-request.dto';
import { SimulationResponseDto, RoomBreakdownDto, ModifierDto } from './dto/simulation-response.dto';
import { AffiliateEmailSpoStatus, ContractStatus, UserRole } from '../../common/constants/enums';
import {
    DEFAULT_SIMULATION_CONTRACT_STATUSES,
    INACTIVE_SIMULATION_CONTRACT_STATUSES,
    SimulationContractMatcherService,
} from './simulation-contract-matcher.service';
import { PricingEngineService } from './pricing-engine.service';
import { RequestUser } from '../../common/interfaces/request.interface';

@Injectable()
export class SimulationService {
    constructor(
        @InjectRepository(Contract)
        private readonly contractRepo: Repository<Contract>,
        @InjectRepository(ContractLine)
        private readonly lineRepo: Repository<ContractLine>,
        @InjectRepository(ContractReduction)
        private readonly reductionRepo: Repository<ContractReduction>,
        @InjectRepository(ContractMonoparentalRule)
        private readonly monoparentalRepo: Repository<ContractMonoparentalRule>,
        @InjectRepository(ContractEarlyBooking)
        private readonly earlyBookingRepo: Repository<ContractEarlyBooking>,
        @InjectRepository(ContractSpo)
        private readonly spoRepo: Repository<ContractSpo>,
        @InjectRepository(ContractSupplement)
        private readonly supplementRepo: Repository<ContractSupplement>,
        @InjectRepository(AffiliateEmailSpo)
        private readonly affiliateEmailSpoRepo: Repository<AffiliateEmailSpo>,
        private readonly contractMatcher: SimulationContractMatcherService,
        private readonly pricingEngine: PricingEngineService,
    ) { }

    async calculate(hotelId: number, dto: SimulationRequestDto, user?: RequestUser): Promise<SimulationResponseDto> {
        const contract = await this.contractRepo.findOne({
            where: { id: dto.contractId, hotel: { id: hotelId } },
            relations: [
                'periods',
                'contractRooms',
                'contractRooms.roomType',
                'baseArrangement',
            ],
        });

        if (!contract) {
            throw new NotFoundException(`Contract #${dto.contractId} not found in hotel #${hotelId}`);
        }

        const allowedStatuses = this.resolveAllowedStatuses(Boolean(dto.includeInactive), user);

        if (!allowedStatuses.includes(contract.status)) {
            if (contract.status === ContractStatus.EXPIRED || contract.status === ContractStatus.TERMINATED) {
                throw new BadRequestException(
                    `Contract #${dto.contractId} is ${contract.status}. Enable includeInactive to simulate it explicitly.`,
                );
            }
            throw new BadRequestException(`Contract #${dto.contractId} is not allowed for simulation (Status: ${contract.status})`);
        }

        const startDate = this.dbDateToLocalMidnight(dto.checkIn)!;
        const endDate = this.dbDateToLocalMidnight(dto.checkOut)!;

        if (!startDate || !endDate) {
            throw new BadRequestException('Valid check-in and check-out dates are required');
        }

        if (startDate >= endDate) {
            throw new BadRequestException('Check-out date must be after check-in date');
        }

        await this.contractMatcher.assertContractMatches({
            hotelId,
            affiliateId: dto.affiliateId,
            contractId: dto.contractId,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            allowedStatuses,
        });

        const allReductions = await this.reductionRepo.find({
            where: { contract: { id: dto.contractId } },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicablePeriods',
                'applicablePeriods.period',
            ],
        });

        const allMonoparentalRules = await this.monoparentalRepo.find({
            where: { contract: { id: dto.contractId } },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicablePeriods',
                'applicablePeriods.period',
            ],
        });

        const allEarlyBookings = await this.earlyBookingRepo.find({
            where: { contract: { id: dto.contractId } },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicablePeriods',
                'applicablePeriods.period',
            ],
        });

        const allSpos = await this.spoRepo.find({
            where: { contract: { id: dto.contractId } },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicablePeriods',
                'applicablePeriods.period',
                'applicableArrangements',
                'applicableArrangements.arrangement',
            ],
        });

        const allSupplements = await this.supplementRepo.find({
            where: { contract: { id: dto.contractId } },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicablePeriods',
                'applicablePeriods.period',
                'targetArrangement',
            ],
        });

        const matchedAffiliateEmailSpo = await this.affiliateEmailSpoRepo.findOne({
            where: {
                hotelId,
                affiliateId: dto.affiliateId,
                status: AffiliateEmailSpoStatus.ACTIVE,
                applicationFrom: LessThanOrEqual(dto.checkIn as any),
                applicationTo: MoreThanOrEqual(dto.checkOut as any),
            },
            order: { applicationFrom: 'DESC', id: 'DESC' },
        });

        const lines = await this.lineRepo.find({
            where: {
                period: { contract: { id: dto.contractId } },
            },
            relations: ['period', 'contractRoom', 'contractRoom.roomType', 'prices', 'prices.arrangement'],
        });

        const totalNights = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const bookingDate = dto.bookingDate ? this.dbDateToLocalMidnight(dto.bookingDate)! : this.dbDateToLocalMidnight(new Date())!;
        const leadTime = Math.ceil((startDate.getTime() - bookingDate.getTime()) / (1000 * 60 * 60 * 24));

        let globalTotalBrut = 0;
        let globalTotalRemise = 0;
        let globalTotalGross = 0;
        const roomsBreakdown: RoomBreakdownDto[] = [];
        const allStayModifiers: ModifierDto[] = [];

        dto.roomingList.forEach((roomItem, index) => {
            const boardTypeId = this.resolveRoomBoardTypeId(roomItem, dto.boardTypeId, index);
            const roomResult = this.pricingEngine.calculateRoom({
                roomIndex: index + 1,
                roomItem,
                boardTypeId,
                contract,
                lines,
                allReductions,
                allMonoparentalRules,
                allEarlyBookings,
                allSpos,
                allSupplements,
                emailSpo: matchedAffiliateEmailSpo,
                startDate,
                totalNights,
                bookingDate,
                leadTime,
            });

            globalTotalBrut += roomResult.totalBrut;
            globalTotalRemise += roomResult.totalRemise;
            globalTotalGross += roomResult.totalGross;
            roomsBreakdown.push(roomResult.breakdown);
            allStayModifiers.push(...roomResult.stayModifiers);
        });

        const combinedStayModifiers = allStayModifiers.reduce((acc, curr) => {
            const existing = acc.find(m => m.name === curr.name);
            if (existing) {
                existing.amount += curr.amount;
            } else {
                acc.push({ ...curr });
            }
            return acc;
        }, [] as ModifierDto[]);

        return {
            contractId: dto.contractId,
            contractStatus: contract.status,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            currency: contract.currency,
            inactiveContractOverride: {
                enabled: contract.status !== ContractStatus.ACTIVE,
                contractStatus: contract.status,
                reason: dto.inactiveOverrideReason?.trim() || undefined,
            },
            totalBrut: this.round(globalTotalBrut, 3),
            totalRemise: this.round(globalTotalRemise, 3),
            totalGross: this.round(globalTotalGross, 3),
            totalNet: this.round(globalTotalGross, 3),
            roomsBreakdown,
            stayModifiers: combinedStayModifiers.map(m => ({ ...m, amount: this.round(m.amount, 3) })),
        };
    }

    private resolveAllowedStatuses(includeInactive: boolean, user?: RequestUser): ContractStatus[] {
        if (!includeInactive) return DEFAULT_SIMULATION_CONTRACT_STATUSES;
        if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.COMMERCIAL)) {
            throw new ForbiddenException('You are not allowed to include inactive contracts in simulation.');
        }
        return INACTIVE_SIMULATION_CONTRACT_STATUSES;
    }

    private resolveRoomBoardTypeId(roomItem: RoomingItemDto, fallbackBoardTypeId: number | undefined, roomIndex: number): number {
        const boardTypeId = Number(roomItem.boardTypeId ?? fallbackBoardTypeId);
        if (!Number.isFinite(boardTypeId) || boardTypeId <= 0) {
            throw new BadRequestException(`boardTypeId is required for room #${roomIndex + 1}`);
        }
        return boardTypeId;
    }

    private round(value: number, precision: number): number {
        const factor = Math.pow(10, precision);
        return Math.round(value * factor) / factor;
    }

    private dbDateToLocalMidnight(d: Date | string | null | undefined): Date | null {
        if (!d) return null;
        const date = new Date(d);
        if (isNaN(date.getTime())) return null;
        const y = date.getUTCFullYear();
        const m = date.getUTCMonth();
        const day = date.getUTCDate();
        return new Date(y, m, day, 0, 0, 0, 0);
    }
}
