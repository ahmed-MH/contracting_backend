import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract } from '../contract/core/entities/contract.entity';
import { ContractLine } from '../contract/core/entities/contract-line.entity';
import { ContractReduction } from '../contract/reduction/entities/contract-reduction.entity';
import { ContractMonoparentalRule } from '../contract/monoparental/entities/contract-monoparental-rule.entity';
import { ContractEarlyBooking } from '../contract/early-booking/entities/contract-early-booking.entity';
import { ContractSpo } from '../contract/spo/entities/contract-spo.entity';
import { ContractSupplement } from '../contract/supplement/entities/contract-supplement.entity';
import { SimulationRequestDto, RoomingItemDto, OccupantType } from './dto/simulation-request.dto';
import { SimulationResponseDto, RoomBreakdownDto, DailyRateDto, ModifierDto } from './dto/simulation-response.dto';
import { ContractStatus, ReductionCalculationType, BaseRateType, ChildSurchargeBase, PricingModifierApplicationType, SupplementCalculationType, SpoBenefitType, SpoConditionType, SupplementSystemCode, ReductionSystemCode } from '../../common/constants/enums';

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
    ) { }

    async calculate(hotelId: number, dto: SimulationRequestDto): Promise<SimulationResponseDto> {
        // 1. Load Contract with relevant relations
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

        if (contract.status !== ContractStatus.ACTIVE) {
            throw new BadRequestException(`Contract #${dto.contractId} is not ACTIVE (Status: ${contract.status})`);
        }

        // 2. Load all possible rules for this contract (Targeting will be filtered in-memory for efficiency)
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
                'applicableArrangements.arrangement'
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

        // 3. Fetch all pricing lines for this contract
        const lines = await this.lineRepo.find({
            where: {
                period: { contract: { id: dto.contractId } }
            },
            relations: ['period', 'contractRoom', 'contractRoom.roomType', 'prices', 'prices.arrangement']
        });

        const startDate = this.dbDateToLocalMidnight(dto.checkIn)!;
        const endDate = this.dbDateToLocalMidnight(dto.checkOut)!;

        if (startDate >= endDate) {
            throw new BadRequestException('Check-out date must be after check-in date');
        }

        const totalNights = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const bookingDate = dto.bookingDate ? this.dbDateToLocalMidnight(dto.bookingDate)! : this.dbDateToLocalMidnight(new Date())!;
        
        const leadTime = Math.ceil((startDate.getTime() - bookingDate.getTime()) / (1000 * 60 * 60 * 24));

        let globalTotalBrut = 0;
        let globalTotalRemise = 0;
        let globalTotalGross = 0;
        const roomsBreakdown: RoomBreakdownDto[] = [];
        const allStayModifiers: ModifierDto[] = [];

        // 4. Calculate each room in the rooming list
        dto.roomingList.forEach((roomItem, index) => {
            const roomResult = this.calculateRoom(
                index + 1,
                roomItem,
                dto.boardTypeId,
                contract,
                lines,
                allReductions,
                allMonoparentalRules,
                allEarlyBookings,
                allSpos,
                allSupplements,
                startDate,
                totalNights,
                bookingDate,
                leadTime
            );

            globalTotalBrut += roomResult.totalBrut;
            globalTotalRemise += roomResult.totalRemise;
            globalTotalGross += roomResult.totalGross;
            roomsBreakdown.push(roomResult.breakdown);
            allStayModifiers.push(...roomResult.stayModifiers);
        });

        // Combine stay modifiers by name
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
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            currency: contract.currency,
            totalBrut: this.round(globalTotalBrut, 3),
            totalRemise: this.round(globalTotalRemise, 3),
            totalGross: this.round(globalTotalGross, 3),
            totalNet: this.round(globalTotalGross, 3), // Same as gross for now
            roomsBreakdown,
            stayModifiers: combinedStayModifiers.map(m => ({ ...m, amount: this.round(m.amount, 3) })),
        };
    }

    private calculateRoom(
        roomIndex: number,
        roomItem: RoomingItemDto,
        boardTypeId: number,
        contract: Contract,
        lines: ContractLine[],
        allReductions: ContractReduction[],
        allMonoparentalRules: ContractMonoparentalRule[],
        allEarlyBookings: ContractEarlyBooking[],
        allSpos: ContractSpo[],
        allSupplements: ContractSupplement[],
        startDate: Date,
        totalNights: number,
        bookingDate: Date,
        leadTime: number
    ) {
        const adultsCount = roomItem.occupants.filter(o => o.type === OccupantType.ADULT).length;
        const childrenAges = roomItem.occupants.filter(o => o.type === OccupantType.CHILD || o.type === OccupantType.INFANT).map(o => o.age);
        const occupants = { adults: adultsCount, childrenAges };

        // ─── PASS 1: Calculate Occupational Net for each night ───
        const dailyData: Array<{
            dateStr: string;
            currentDate: Date;
            baseRate: number;
            occupationalNet: number;
            reductionsApplied: Array<{ name: string, amount: number }>;
            line: ContractLine | null;
            isAvailable: boolean;
            reason?: string;
        }> = [];

        let totalOccupationalSum = 0;

        for (let i = 0; i < totalNights; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const dayStr = String(currentDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${dayStr}`;

            // Find the line for this date and room
            const line = lines.find(l => {
                const pStart = this.dbDateToLocalMidnight(l.period.startDate)!;
                const pEnd = this.dbDateToLocalMidnight(l.period.endDate)!;
                return currentDate >= pStart && currentDate <= pEnd && l.contractRoom.roomType.id === roomItem.roomId;
            });

            if (!line) {
                dailyData.push({ dateStr, currentDate, baseRate: 0, occupationalNet: 0, reductionsApplied: [], line: null, isAvailable: false, reason: 'No rate found' });
            } else if (!line.isContracted) {
                dailyData.push({ dateStr, currentDate, baseRate: 0, occupationalNet: 0, reductionsApplied: [], line, isAvailable: false, reason: 'Not contracted' });
            } else {
                const price = this.selectBasePrice(line, contract.baseArrangementId);
                if (!price) {
                    dailyData.push({ dateStr, currentDate, baseRate: 0, occupationalNet: 0, reductionsApplied: [], line, isAvailable: false, reason: 'No base-board rate' });
                } else {
                    const baseRate = Number(price.amount);
                    let nightNet = 0;
                    const reductionsApplied: Array<{ name: string, amount: number }> = [];

                    // ─── OCCUPATION LOGIC: Room Base Price Construction ───
                    let isMonoparentalApplied = false;

                    // 1. Calculate Single Supplement beforehand
                    const singleSupp = allSupplements.find(s => {
                        const matchesCode = s.systemCode === SupplementSystemCode.SINGLE_OCCUPANCY;
                        const matchesRoom = s.applicableContractRooms.length === 0 || s.applicableContractRooms.some(acr => acr.contractRoom?.id === line.contractRoom.id);
                        const matchesPeriod = s.applicablePeriods.length === 0 || s.applicablePeriods.some(ap => ap.period?.id === line.period.id);
                        return matchesCode && matchesRoom && matchesPeriod;
                    });
                    
                    let suppValue = 0;
                    let suppName = '';
                    
                    if (singleSupp) {
                        const singleValue = this.supplementValueForPeriod(singleSupp, line.period.id);
                        if (singleSupp.type === SupplementCalculationType.PERCENTAGE) {
                            suppValue = this.round((singleValue / 100) * baseRate, 3);
                            suppName = `Supplément Single (${singleValue}%)`;
                        } else {
                            suppValue = singleValue;
                            suppName = `Supplément Single (${singleSupp.name})`;
                        }
                    }

                    const singleBasePrice = this.round(baseRate + suppValue, 3);
                    const doubleBasePrice = this.round(baseRate * 2, 3);

                    // 2. Monoparental Interception
                    if (occupants.adults === 1 && occupants.childrenAges.length > 0) {
                        const mRule = allMonoparentalRules.find(r => {
                            const matchesRoom = r.applicableContractRooms.length === 0 || r.applicableContractRooms.some(acr => acr.contractRoom?.id === line.contractRoom.id);
                            const matchesPeriod = r.applicablePeriods.length === 0 || r.applicablePeriods.some(ap => ap.period?.id === line.period.id);
                            const matchesOccupants = r.childCount === occupants.childrenAges.length && occupants.childrenAges.every(age => age >= Number(r.minAge) && age <= Number(r.maxAge));
                            return matchesRoom && matchesPeriod && matchesOccupants;
                        });

                        if (mRule) {
                            isMonoparentalApplied = true;
                            
                            let basePriceForAdult = baseRate;
                            if (mRule.baseRateType === BaseRateType.SINGLE) basePriceForAdult = singleBasePrice;
                            else if (mRule.baseRateType === BaseRateType.DOUBLE) basePriceForAdult = doubleBasePrice;
                            else if (mRule.baseRateType === BaseRateType.TRIPLE) basePriceForAdult = baseRate * 3;

                            let surchargeBase = baseRate;
                            if (mRule.childSurchargeBase === ChildSurchargeBase.SINGLE) surchargeBase = singleBasePrice;
                            else if (mRule.childSurchargeBase === ChildSurchargeBase.DOUBLE) surchargeBase = doubleBasePrice;
                            else if (mRule.childSurchargeBase === ChildSurchargeBase.HALF_SINGLE) surchargeBase = singleBasePrice / 2;
                            else if (mRule.childSurchargeBase === ChildSurchargeBase.HALF_DOUBLE) surchargeBase = baseRate;

                            const surchargePerChild = this.round((Number(mRule.childSurchargePercentage) / 100) * surchargeBase, 3);
                            const totalSurcharge = surchargePerChild * occupants.childrenAges.length;

                            nightNet = this.round(basePriceForAdult + totalSurcharge, 3);
                            
                            const totalMonoAdjustment = this.round((basePriceForAdult - baseRate) + totalSurcharge, 3);
                            reductionsApplied.push({ name: `Supplément Monoparental (${mRule.name})`, amount: totalMonoAdjustment });
                        }
                    }

                    // 3. Fallback / Standard Logic
                    if (!isMonoparentalApplied) {
                        if (occupants.adults === 1) {
                            nightNet = singleBasePrice;
                            if (singleSupp) reductionsApplied.push({ name: suppName, amount: suppValue });
                        } else {
                            nightNet = doubleBasePrice;
                        }

                        const extraPaxPrice = this.applyStandardReductions(occupants, line, baseRate, allReductions, reductionsApplied, totalNights);
                        nightNet = this.round(nightNet + extraPaxPrice, 3);
                    }

                    dailyData.push({ dateStr, currentDate, baseRate, occupationalNet: nightNet, reductionsApplied, line, isAvailable: true });
                    totalOccupationalSum += nightNet;
                }
            }
        }

        // ─── PASS 2: Promotional Arbitrage ───
        interface BestPromotion {
            name: string;
            totalSaving: number;
            rule: any;
            type: 'EB' | 'SPO';
            cheapestDates?: string[];
        }

        const ebCandidates: BestPromotion[] = [];
        const spoCandidates: BestPromotion[] = [];

        allEarlyBookings.forEach(r => {
            let totalSaving = 0;
            const ebValue = Number(r.value || 0);

            if (leadTime >= r.releaseDays) {
                const eligibleDays = dailyData.filter(day => {
                    if (!day.isAvailable || !day.line) return false;
                    const matchesBooking = (!r.bookingWindowStart || bookingDate >= this.dbDateToLocalMidnight(r.bookingWindowStart)!) && (!r.bookingWindowEnd || bookingDate <= this.dbDateToLocalMidnight(r.bookingWindowEnd)!);
                    const matchesStay = (!r.stayWindowStart || day.currentDate >= this.dbDateToLocalMidnight(r.stayWindowStart)!) && (!r.stayWindowEnd || day.currentDate <= this.dbDateToLocalMidnight(r.stayWindowEnd)!);
                    const matchesRoom = r.applicableContractRooms.length === 0 || r.applicableContractRooms.some(acr => acr.contractRoom?.id === day.line!.contractRoom.id);
                    const matchesPeriod = r.applicablePeriods.length === 0 || r.applicablePeriods.some(ap => ap.period?.id === day.line!.period.id);
                    return matchesBooking && matchesStay && matchesRoom && matchesPeriod;
                });

                if (eligibleDays.length > 0) {
                    if (r.applicationType === PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
                        if (r.calculationType === ReductionCalculationType.PERCENTAGE) {
                            const eligibleTotal = eligibleDays.reduce((acc, day) => acc + day.occupationalNet, 0);
                            totalSaving = this.round((ebValue / 100) * eligibleTotal, 3);
                        } else {
                            totalSaving = this.round(ebValue, 3);
                        }
                    } else {
                        totalSaving = eligibleDays.reduce((acc, day) => acc + this.calculateSaving(r.calculationType, ebValue, day.occupationalNet, r.applicationType, occupants, totalNights), 0);
                    }
                }
            }
            if (totalSaving > 0) ebCandidates.push({ name: `Early Booking (${r.name})`, totalSaving, rule: r, type: 'EB' });
        });

        /* istanbul ignore next */
        allSpos.forEach(r => {
            let totalSaving = 0;
            const stayDuration = totalNights;

            const rawBenefitValue = r.benefitValue !== null && r.benefitValue !== undefined ? Number(r.benefitValue) : 0;
            const rawValue = r.value !== null && r.value !== undefined ? Number(r.value) : 0;

            let spoValue = rawBenefitValue;
            if (rawBenefitValue === 1 && rawValue > 1) spoValue = rawValue;
            else if (rawBenefitValue === 0 && rawValue > 0) spoValue = rawValue;

            if (r.conditionType === SpoConditionType.MIN_NIGHTS || r.conditionType === SpoConditionType.LONG_STAY) {
                if (r.conditionValue && stayDuration < r.conditionValue) return;
            }
            if (r.stayNights && stayDuration < r.stayNights) return;

            let cheapestDates: string[] = [];

            const eligibleDays = dailyData.filter(day => {
                if (!day.isAvailable || !day.line) return false;
                const matchesRoom = r.applicableContractRooms.length === 0 || r.applicableContractRooms.some(csr => csr.contractRoom?.id === day.line!.contractRoom.id);
                const matchesPeriod = r.applicablePeriods.length === 0 || r.applicablePeriods.some(ap => ap.period?.id === day.line!.period.id);
                const matchesArrangement = r.applicableArrangements.length === 0 || r.applicableArrangements.some(aa => aa.arrangement?.id === boardTypeId);
                return matchesRoom && matchesPeriod && matchesArrangement;
            });

            if (eligibleDays.length > 0) {
                if (r.benefitType === SpoBenefitType.FREE_NIGHTS) {
                    const freeNightsCount = r.payNights > 0 ? (stayDuration - r.payNights) : spoValue;
                    
                    let actualFreeNights = freeNightsCount;
                    if (r.stayNights && r.stayNights > 0 && r.payNights > 0) {
                        const multiples = Math.floor(stayDuration / r.stayNights);
                        actualFreeNights = multiples * (r.stayNights - r.payNights);
                    }

                    if (actualFreeNights > 0) {
                        const sortedDays = [...eligibleDays].sort((a, b) => a.occupationalNet - b.occupationalNet);
                        const freeDays = sortedDays.slice(0, actualFreeNights);
                        totalSaving = freeDays.reduce((acc, day) => acc + day.occupationalNet, 0);
                        cheapestDates = freeDays.map(d => d.dateStr);
                    }
                } else if (r.applicationType === PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
                    if (r.benefitType === SpoBenefitType.PERCENTAGE_DISCOUNT) {
                        const eligibleTotal = eligibleDays.reduce((acc, day) => acc + day.occupationalNet, 0);
                        totalSaving = this.round((spoValue / 100) * eligibleTotal, 3);
                    } else if (r.benefitType === SpoBenefitType.FIXED_DISCOUNT) {
                        totalSaving = this.round(spoValue, 3);
                    }
                } else {
                    const calcType = r.benefitType === SpoBenefitType.FIXED_DISCOUNT ? ReductionCalculationType.FIXED : ReductionCalculationType.PERCENTAGE;
                    totalSaving = eligibleDays.reduce((acc, day) => acc + this.calculateSaving(calcType, spoValue, day.occupationalNet, r.applicationType, occupants, totalNights), 0);
                }
            }
            if (totalSaving > 0) spoCandidates.push({ name: `SPO (${r.name})`, totalSaving, rule: r, type: 'SPO', cheapestDates });
        });

        const winnerEB = ebCandidates.sort((a, b) => b.totalSaving - a.totalSaving)[0] || null;
        const winnerSPO = spoCandidates.sort((a, b) => b.totalSaving - a.totalSaving)[0] || null;

        // ─── PASS 3: Generate Response ───
        const breakdown: DailyRateDto[] = [];
        const stayModifiers: Array<{ name: string, amount: number }> = [];
        const eventModifiers: Array<{ name: string, amount: number }> = [];
        let totalDailyNet = 0;
        let totalDailyBrut = 0; 
        let totalDailyRemise = 0; 

        dailyData.forEach(day => {
            let promoSaving = 0;
            const appliedPromotions: Array<{ name: string, amount: number }> = [];

            if (day.line) {
                let nightNetAfterSPO = day.occupationalNet;
                /* istanbul ignore next */
                if (winnerSPO) {
                    const r = winnerSPO.rule;
                    let dailySposaving = 0;

                    if (r.benefitType === SpoBenefitType.FREE_NIGHTS) {
                        if (winnerSPO.cheapestDates?.includes(day.dateStr)) {
                            dailySposaving = day.occupationalNet;
                        }
                    } else if (r.applicationType !== PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
                        const matchesRoom = r.applicableContractRooms.length === 0 || r.applicableContractRooms.some(csr => csr.contractRoom?.id === day.line!.contractRoom.id);
                        const matchesPeriod = r.applicablePeriods.length === 0 || r.applicablePeriods.some(ap => ap.period?.id === day.line!.period.id);
                        const matchesArrangement = r.applicableArrangements.length === 0 || r.applicableArrangements.some(aa => aa.arrangement?.id === boardTypeId);
                        
                        if (matchesRoom && matchesPeriod && matchesArrangement) {
                            const spoCalcType = r.benefitType === SpoBenefitType.FIXED_DISCOUNT ? ReductionCalculationType.FIXED : ReductionCalculationType.PERCENTAGE;
                            const spoValue = Number(r.benefitValue !== null && r.benefitValue !== undefined ? r.benefitValue : r.value);
                            dailySposaving = this.calculateSaving(spoCalcType, spoValue, day.occupationalNet, r.applicationType, occupants, totalNights);
                        }
                    }

                    if (dailySposaving > 0) {
                        appliedPromotions.push({ name: winnerSPO.name, amount: -dailySposaving });
                        promoSaving += dailySposaving;
                        nightNetAfterSPO = this.round(day.occupationalNet - dailySposaving, 3);
                    }
                }

                /* istanbul ignore next */
                if (winnerEB && winnerEB.rule.applicationType !== PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
                    const r = winnerEB.rule;
                    const matchesBooking = (!r.bookingWindowStart || bookingDate >= this.dbDateToLocalMidnight(r.bookingWindowStart)!) && (!r.bookingWindowEnd || bookingDate <= this.dbDateToLocalMidnight(r.bookingWindowEnd)!);
                    const matchesStay = (!r.stayWindowStart || day.currentDate >= this.dbDateToLocalMidnight(r.stayWindowStart)!) && (!r.stayWindowEnd || day.currentDate <= this.dbDateToLocalMidnight(r.stayWindowEnd)!);
                    const matchesRoom = r.applicableContractRooms.length === 0 || r.applicableContractRooms.some(acr => acr.contractRoom?.id === day.line!.contractRoom.id);
                    const matchesPeriod = r.applicablePeriods.length === 0 || r.applicablePeriods.some(ap => ap.period?.id === day.line!.period.id);
                    
                    if (matchesBooking && matchesStay && matchesRoom && matchesPeriod) {
                        const ebSaving = this.calculateSaving(r.calculationType, Number(r.value), nightNetAfterSPO, r.applicationType, occupants, totalNights);
                        if (ebSaving > 0) {
                            appliedPromotions.push({ name: winnerEB.name, amount: -ebSaving });
                            promoSaving += ebSaving;
                        }
                    }
                }
            }

            const promotionApplied = appliedPromotions.length > 0 ? {
                name: appliedPromotions.map(p => p.name).join(' + '),
                amount: appliedPromotions.reduce((acc, p) => acc + p.amount, 0)
            } : null;

            const promoRate = this.round(day.occupationalNet - promoSaving, 3);
            const supplementsApplied: Array<{ name: string, amount: number }> = [];
            const eventSupplementsForDay: Array<{ name: string, amount: number }> = [];

            if (day.isAvailable && day.line) {
                allSupplements.filter(s => {
                    /* istanbul ignore next */
                    const matchesRoom = s.applicableContractRooms.length === 0 || s.applicableContractRooms.some(acr => acr.contractRoom?.id === day.line!.contractRoom.id);
                    /* istanbul ignore next */
                    const matchesPeriod = s.applicablePeriods.length === 0 || s.applicablePeriods.some(ap => ap.period?.id === day.line!.period.id);
                    /* istanbul ignore next */
                    const isForDate = !s.specificDate || s.specificDate === day.dateStr;
                    /* istanbul ignore next */
                    const isNotSingle = s.systemCode !== SupplementSystemCode.SINGLE_OCCUPANCY;
                    /* istanbul ignore next */
                    const matchesSelectedMealPlan = this.matchesSelectedMealPlan(s, boardTypeId, contract);
                    /* istanbul ignore next */
                    return s.isMandatory && matchesRoom && matchesPeriod && isForDate && isNotSingle && matchesSelectedMealPlan;
                }).forEach(s => {
                    const supplementBaseValue = this.supplementValueForPeriod(s, day.line!.period.id);
                    /* istanbul ignore next */
                    if (s.applicationType === PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
                        if (!stayModifiers.some(sm => sm.name === s.name)) {
                            stayModifiers.push({ name: s.name, amount: supplementBaseValue });
                        }
                    } else {
                        let amount = supplementBaseValue;
                        
                        /* istanbul ignore next */
                        if (s.applicationType === PricingModifierApplicationType.PER_NIGHT_PER_PERSON) {
                            const minAge = s.minAge ?? 0;
                            const maxAge = s.maxAge ?? 99;
                            let eligiblePaxCount = 0;
                            if (maxAge > 17) eligiblePaxCount += occupants.adults;
                            occupants.childrenAges.forEach(age => {
                                if (age >= minAge && age <= maxAge) eligiblePaxCount++;
                            });
                            
                            if (eligiblePaxCount > 0) {
                                amount *= eligiblePaxCount;
                                if (s.specificDate) {
                                    eventSupplementsForDay.push({ name: `${s.name} - Formule: ${supplementBaseValue} ${contract.currency} x ${eligiblePaxCount} Pax`, amount: this.round(amount, 3) });
                                } else {
                                    supplementsApplied.push({ name: s.name, amount: this.round(amount, 3) });
                                }
                            }
                        } else {
                            /* istanbul ignore next */
                            if (s.specificDate) {
                                eventSupplementsForDay.push({ name: s.name, amount: this.round(amount, 3) });
                            } else {
                                supplementsApplied.push({ name: s.name, amount: this.round(amount, 3) });
                            }
                        }
                    }
                });
            }

            const dailySupplementsTotal = supplementsApplied.reduce((acc, c) => acc + c.amount, 0);
            const dailyEventsTotal = eventSupplementsForDay.reduce((acc, c) => acc + c.amount, 0);
            
            const finalDailyRate = this.round(promoRate + dailySupplementsTotal, 3);
            const totalPax = occupants.adults + occupants.childrenAges.length;

            breakdown.push({
                date: day.dateStr,
                baseRate: day.baseRate,
                reductionsApplied: day.reductionsApplied,
                netRate: day.occupationalNet,
                promotionApplied,
                promoRate,
                supplementsApplied,
                finalDailyRate,
                perPersonRate: totalPax > 0 ? this.round(finalDailyRate / totalPax, 3) : 0,
                currency: contract.currency,
                isAvailable: day.isAvailable,
                reason: day.reason
            });

            if (day.isAvailable) {
                totalDailyBrut += (day.occupationalNet + dailySupplementsTotal);
                totalDailyRemise += promoSaving;
                totalDailyNet += finalDailyRate;
                
                eventSupplementsForDay.forEach(es => {
                    eventModifiers.push({ name: `${es.name} (${day.dateStr})`, amount: es.amount });
                });
            }
        });

        /* istanbul ignore next */
        if (winnerSPO && winnerSPO.rule.applicationType === PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
            stayModifiers.push({ name: winnerSPO.name, amount: -winnerSPO.totalSaving });
        }
        /* istanbul ignore next */
        if (winnerEB && winnerEB.rule.applicationType === PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
            let actualEbSaving = winnerEB.totalSaving;
            if (winnerEB.rule.calculationType === ReductionCalculationType.PERCENTAGE) {
                const spoSavingTotal = (winnerSPO && winnerSPO.rule.applicationType !== PricingModifierApplicationType.FLAT_RATE_PER_STAY) ? totalDailyRemise : 0;
                const eligibleTotalOriginal = dailyData.filter(day => {
                    const r = winnerEB.rule;
                    const matchesBooking = (!r.bookingWindowStart || bookingDate >= this.dbDateToLocalMidnight(r.bookingWindowStart)!) && (!r.bookingWindowEnd || bookingDate <= this.dbDateToLocalMidnight(r.bookingWindowEnd)!);
                    const matchesStay = (!r.stayWindowStart || day.currentDate >= this.dbDateToLocalMidnight(r.stayWindowStart)!) && (!r.stayWindowEnd || day.currentDate <= this.dbDateToLocalMidnight(r.stayWindowEnd)!);
                    const matchesRoom = r.applicableContractRooms.length === 0 || r.applicableContractRooms.some(acr => acr.contractRoom?.id === day.line!.contractRoom.id);
                    const matchesPeriod = r.applicablePeriods.length === 0 || r.applicablePeriods.some(ap => ap.period?.id === day.line!.period.id);
                    return day.isAvailable && day.line && matchesBooking && matchesStay && matchesRoom && matchesPeriod;
                }).reduce((acc, d) => acc + d.occupationalNet, 0);

                const eligibleTotalRemaining = eligibleTotalOriginal - spoSavingTotal;
                actualEbSaving = this.round((Number(winnerEB.rule.value) / 100) * eligibleTotalRemaining, 3);
            }
            stayModifiers.push({ name: winnerEB.name, amount: -actualEbSaving });
        }

        const stayModifiersTotal = stayModifiers.reduce((acc, sm) => acc + sm.amount, 0);
        const eventModifiersTotal = eventModifiers.reduce((acc, em) => acc + em.amount, 0);
        const finalGrossTotal = this.round(totalDailyNet + stayModifiersTotal + eventModifiersTotal, 3);

        return {
            totalBrut: totalDailyBrut,
            totalRemise: totalDailyRemise,
            totalGross: finalGrossTotal,
            breakdown: {
                roomIndex,
                roomId: roomItem.roomId,
                roomTotalNet: finalGrossTotal,
                dailyRates: breakdown,
            },
            stayModifiers: [...stayModifiers, ...eventModifiers]
        };
    }

    private selectBasePrice(line: ContractLine, baseArrangementId?: number | null) {
        if (!line.prices?.length) return null;
        if (!baseArrangementId) return line.prices[0];
        return line.prices.find((price) => price.arrangement?.id === baseArrangementId) ?? line.prices[0];
    }

    private matchesSelectedMealPlan(supplement: ContractSupplement, boardTypeId: number, contract: Contract): boolean {
        if (supplement.systemCode !== SupplementSystemCode.MEAL_PLAN) return true;
        if (!boardTypeId || boardTypeId === contract.baseArrangementId) return false;
        return supplement.targetArrangement?.id === boardTypeId || supplement.targetArrangementId === boardTypeId;
    }

    private findSupplementPeriodTarget(supplement: ContractSupplement, periodId: number): any | undefined {
        return supplement.applicablePeriods?.find((target: any) => target.period?.id === periodId || target.periodId === periodId);
    }

    private supplementValueForPeriod(supplement: ContractSupplement, periodId: number): number {
        const periodTarget = this.findSupplementPeriodTarget(supplement, periodId);
        return Number(periodTarget?.overrideValue ?? supplement.value ?? 0) || 0;
    }

    private round(value: number, precision: number): number {
        const factor = Math.pow(10, precision);
        return Math.round(value * factor) / factor;
    }

    /* istanbul ignore next */
    private calculateSaving(
        type: ReductionCalculationType,
        value: number,
        rate: number,
        applicationType: PricingModifierApplicationType,
        occupants: { adults: number, childrenAges: number[] },
        totalNights: number
    ): number {
        let baseSaving = 0;
        if (type === ReductionCalculationType.PERCENTAGE) {
            baseSaving = (value / 100) * rate;
        } else if (type === ReductionCalculationType.FIXED) {
            baseSaving = value;
        } else if (type === ReductionCalculationType.FREE) {
            baseSaving = rate;
        }

        if (type === ReductionCalculationType.PERCENTAGE) return this.round(baseSaving, 3);

        const totalPax = occupants.adults + occupants.childrenAges.length;
        if (applicationType === PricingModifierApplicationType.PER_NIGHT_PER_PERSON) {
            return this.round(baseSaving * totalPax, 3);
        }

        return this.round(baseSaving, 3);
    }

    /* istanbul ignore next */
    private applyStandardReductions(
        occupants: { adults: number, childrenAges: number[] },
        line: ContractLine,
        baseRate: number,
        allReductions: ContractReduction[],
        appliedList: Array<{ name: string, amount: number }>,
        totalNights: number
    ): number {
        let extraPaxTotal = 0;

        for (let i = 3; i <= occupants.adults; i++) {
            const extraRule = allReductions.find(r => {
                const matchesSystemCode = r.systemCode === ReductionSystemCode.EXTRA_ADULT;
                const matchesOrder = r.paxOrder === i;
                const matchesRoom = r.applicableContractRooms.length === 0 || r.applicableContractRooms.some(acr => acr.contractRoom?.id === line.contractRoom.id);
                const matchesPeriod = r.applicablePeriods.length === 0 || r.applicablePeriods.some(ap => ap.period?.id === line.period.id);
                return matchesSystemCode && matchesOrder && matchesRoom && matchesPeriod;
            });

            if (extraRule) {
                const reductionAmount = this.calculateReductionAmount(extraRule, baseRate, totalNights);
                const extraAdultCost = this.round(baseRate + reductionAmount, 3);
                appliedList.push({ name: `Adulte ${i} Suppl.`, amount: extraAdultCost });
                extraPaxTotal += extraAdultCost;
            } else {
                const extraAdultCost = this.round(baseRate, 3);
                appliedList.push({ name: `Adulte ${i} Suppl. (Plein Tarif)`, amount: extraAdultCost });
                extraPaxTotal += extraAdultCost;
            }
        }

        occupants.childrenAges.forEach((age, index) => {
            const currentPaxOrder = index + 1;
            const childRule = allReductions.find(r => {
                const matchesSystemCode = r.systemCode === ReductionSystemCode.CHILD;
                const matchesOrder = r.paxOrder === currentPaxOrder;
                const matchesRoom = r.applicableContractRooms.length === 0 || r.applicableContractRooms.some(acr => acr.contractRoom?.id === line.contractRoom.id);
                const matchesPeriod = r.applicablePeriods.length === 0 || r.applicablePeriods.some(ap => ap.period?.id === line.period.id);
                const matchesAge = age >= r.minAge && age <= r.maxAge;
                return matchesSystemCode && matchesOrder && matchesRoom && matchesPeriod && matchesAge;
            });

            if (childRule) {
                const reductionAmount = this.calculateReductionAmount(childRule, baseRate, totalNights);
                const childCost = this.round(baseRate + reductionAmount, 3);
                appliedList.push({ name: `Enfant ${currentPaxOrder} (${age} ans)`, amount: childCost });
                extraPaxTotal += childCost;
            } else {
                const childCost = this.round(baseRate, 3);
                appliedList.push({ name: `Enfant ${currentPaxOrder} (${age} ans) (Plein Tarif)`, amount: childCost });
                extraPaxTotal += childCost;
            }
        });

        return extraPaxTotal;
    }

    /* istanbul ignore next */
    private calculateReductionAmount(rule: ContractReduction, baseRate: number, totalNights: number): number {
        let amount = 0;
        if (rule.calculationType === ReductionCalculationType.PERCENTAGE) {
            amount = -(Number(rule.value) / 100) * baseRate;
            return this.round(amount, 3);
        } else if (rule.calculationType === ReductionCalculationType.FIXED) {
            amount = -Number(rule.value);
        } else if (rule.calculationType === ReductionCalculationType.FREE) {
            amount = -baseRate;
            return this.round(amount, 3);
        }

        if (rule.applicationType === PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
            return this.round(amount / totalNights, 3);
        }

        return this.round(amount, 3);
    }

    /* istanbul ignore next */
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
