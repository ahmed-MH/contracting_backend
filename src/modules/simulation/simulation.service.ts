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
import { SimulationRequestDto } from './dto/simulation-request.dto';
import { SimulationResponse, DailyRate } from './interfaces/simulation-response.interface';
import { ContractStatus, ReductionCalculationType, PaxType, BaseRateType, ChildSurchargeBase, PricingModifierApplicationType, SupplementCalculationType, SpoBenefitType, SpoConditionType, SupplementSystemCode, ReductionSystemCode } from '../../common/constants/enums';

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

    async calculate(dto: SimulationRequestDto): Promise<SimulationResponse> {
        // 1. Load Contract with relevant relations
        const contract = await this.contractRepo.findOne({
            where: { id: dto.contractId },
            relations: [
                'periods',
                'contractRooms',
                'contractRooms.roomType'
            ],
        });

        if (!contract) {
            throw new NotFoundException(`Contract #${dto.contractId} not found`);
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
                return currentDate >= pStart && currentDate <= pEnd && l.contractRoom.roomType.id === dto.roomId;
            });

            if (!line) {
                dailyData.push({ dateStr, currentDate, baseRate: 0, occupationalNet: 0, reductionsApplied: [], line: null, isAvailable: false, reason: 'No rate found' });
            } else if (!line.isContracted) {
                dailyData.push({ dateStr, currentDate, baseRate: 0, occupationalNet: 0, reductionsApplied: [], line, isAvailable: false, reason: 'Not contracted' });
            } else {
                const price = line.prices.find(p => p.arrangement.id === dto.boardTypeId);
                if (!price) {
                    dailyData.push({ dateStr, currentDate, baseRate: 0, occupationalNet: 0, reductionsApplied: [], line, isAvailable: false, reason: 'No arrangement price' });
                } else {
                    const baseRate = Number(price.amount);
                    let nightNet = 0;
                    const reductionsApplied: Array<{ name: string, amount: number }> = [];

                    // ─── OCCUPATION LOGIC: Room Base Price Construction ───
                    let isMonoparentalApplied = false;

                    // 1. Calculate Single Supplement beforehand (needed for Monoparental base & fallback)
                    const singleSupp = allSupplements.find(s => {
                        const matchesCode = s.systemCode === SupplementSystemCode.SINGLE_OCCUPANCY;
                        const matchesRoom = s.applicableContractRooms.length === 0 || s.applicableContractRooms.some(acr => acr.contractRoom?.id === line.contractRoom.id);
                        const matchesPeriod = s.applicablePeriods.length === 0 || s.applicablePeriods.some(ap => ap.period?.id === line.period.id);
                        return matchesCode && matchesRoom && matchesPeriod;
                    });
                    
                    let suppValue = 0;
                    let suppName = '';
                    
                    if (singleSupp) {
                        if (singleSupp.type === SupplementCalculationType.PERCENTAGE) {
                            suppValue = this.round((Number(singleSupp.value) / 100) * baseRate, 3);
                            suppName = `Supplément Single (${singleSupp.value}%)`;
                        } else {
                            suppValue = Number(singleSupp.value) || 0;
                            suppName = `Supplément Single (${singleSupp.name})`;
                        }
                    }

                    const singleBasePrice = this.round(baseRate + suppValue, 3);
                    const doubleBasePrice = this.round(baseRate * 2, 3);

                    // 2. Monoparental Interception (Bypass)
                    if (dto.occupants.adults === 1 && dto.occupants.childrenAges.length > 0) {
                        const mRule = allMonoparentalRules.find(r => {
                            const matchesRoom = r.applicableContractRooms.length === 0 || r.applicableContractRooms.some(acr => acr.contractRoom?.id === line.contractRoom.id);
                            const matchesPeriod = r.applicablePeriods.length === 0 || r.applicablePeriods.some(ap => ap.period?.id === line.period.id);
                            // We expect childCount to match the exact number of children
                            const matchesOccupants = r.childCount === dto.occupants.childrenAges.length && dto.occupants.childrenAges.every(age => age >= Number(r.minAge) && age <= Number(r.maxAge));
                            return matchesRoom && matchesPeriod && matchesOccupants;
                        });

                        if (mRule) {
                            isMonoparentalApplied = true;
                            
                            // A. Prix de Base Parent
                            let basePriceForAdult = baseRate;
                            if (mRule.baseRateType === BaseRateType.SINGLE) basePriceForAdult = singleBasePrice;
                            else if (mRule.baseRateType === BaseRateType.DOUBLE) basePriceForAdult = doubleBasePrice;
                            else if (mRule.baseRateType === BaseRateType.TRIPLE) basePriceForAdult = baseRate * 3;

                            // B. Surcharge Enfant
                            let surchargeBase = baseRate;
                            if (mRule.childSurchargeBase === ChildSurchargeBase.SINGLE) surchargeBase = singleBasePrice;
                            else if (mRule.childSurchargeBase === ChildSurchargeBase.DOUBLE) surchargeBase = doubleBasePrice;
                            else if (mRule.childSurchargeBase === ChildSurchargeBase.HALF_SINGLE) surchargeBase = singleBasePrice / 2;
                            else if (mRule.childSurchargeBase === ChildSurchargeBase.HALF_DOUBLE) surchargeBase = baseRate; // Half double is baseRate

                            const surchargePerChild = this.round((Number(mRule.childSurchargePercentage) / 100) * surchargeBase, 3);
                            const totalSurcharge = surchargePerChild * dto.occupants.childrenAges.length;

                            // C. Final Calculation & Display
                            nightNet = this.round(basePriceForAdult + totalSurcharge, 3);
                            
                            // To match the UI display: "Tarif Base (baseRate) + Supplément Monoparental = Net Occupation"
                            // We group the parent's base adjustment and the child's surcharge into one line.
                            const totalMonoAdjustment = this.round((basePriceForAdult - baseRate) + totalSurcharge, 3);
                            reductionsApplied.push({ name: `Supplément Monoparental (${mRule.name})`, amount: totalMonoAdjustment });
                        }
                    }

                    // 3. Fallback / Standard Logic
                    if (!isMonoparentalApplied) {
                        if (dto.occupants.adults === 1) {
                            nightNet = singleBasePrice;
                            if (singleSupp) reductionsApplied.push({ name: suppName, amount: suppValue });
                        } else {
                            nightNet = doubleBasePrice;
                        }

                        // Apply standard reductions for extra pax and children (Bypassed if monoparental applies)
                        const extraPaxPrice = this.applyStandardReductions(dto, line, baseRate, allReductions, reductionsApplied, totalNights);
                        nightNet = this.round(nightNet + extraPaxPrice, 3);
                    }

                    dailyData.push({ dateStr, currentDate, baseRate, occupationalNet: nightNet, reductionsApplied, line, isAvailable: true });
                    totalOccupationalSum += nightNet;
                }
            }
        }

        // ─── PASS 2: Promotional Arbitrage ───
        // Business Rule (Waterfall):
        // 1. SPOs are NOT cumulative among themselves (best one wins).
        // 2. EBs are NOT cumulative among themselves (best one wins).
        // 3. BEST SPO and BEST EB ARE cumulative.
        // 4. Sequence: Apply SPO first, then EB on the remaining amount.

        interface BestPromotion {
            name: string;
            totalSaving: number;
            rule: any;
            type: 'EB' | 'SPO';
            cheapestDates?: string[];
        }

        const ebCandidates: BestPromotion[] = [];
        const spoCandidates: BestPromotion[] = [];

        // Evaluate Early Bookings
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
                        totalSaving = eligibleDays.reduce((acc, day) => acc + this.calculateSaving(r.calculationType, ebValue, day.occupationalNet, r.applicationType, dto, totalNights), 0);
                    }
                }
            }
            if (totalSaving > 0) ebCandidates.push({ name: `Early Booking (${r.name})`, totalSaving, rule: r, type: 'EB' });
        });

        // Evaluate SPOs
        allSpos.forEach(r => {
            let totalSaving = 0;
            const stayDuration = totalNights;

            const rawBenefitValue = r.benefitValue !== null && r.benefitValue !== undefined ? Number(r.benefitValue) : 0;
            const rawValue = r.value !== null && r.value !== undefined ? Number(r.value) : 0;

            let spoValue = rawBenefitValue;
            if (rawBenefitValue === 1 && rawValue > 1) spoValue = rawValue;
            else if (rawBenefitValue === 0 && rawValue > 0) spoValue = rawValue;

            // SPO Conditions
            if (r.conditionType === SpoConditionType.MIN_NIGHTS || r.conditionType === SpoConditionType.LONG_STAY) {
                if (r.conditionValue && stayDuration < r.conditionValue) return;
            }
            if (r.stayNights && stayDuration < r.stayNights) return;

            let cheapestDates: string[] = [];

            const eligibleDays = dailyData.filter(day => {
                if (!day.isAvailable || !day.line) return false;
                const matchesRoom = r.applicableContractRooms.length === 0 || r.applicableContractRooms.some(csr => csr.contractRoom?.id === day.line!.contractRoom.id);
                const matchesPeriod = r.applicablePeriods.length === 0 || r.applicablePeriods.some(ap => ap.period?.id === day.line!.period.id);
                const matchesArrangement = r.applicableArrangements.length === 0 || r.applicableArrangements.some(aa => aa.arrangement?.id === dto.boardTypeId);
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
                    totalSaving = eligibleDays.reduce((acc, day) => acc + this.calculateSaving(calcType, spoValue, day.occupationalNet, r.applicationType, dto, totalNights), 0);
                }
            }
            if (totalSaving > 0) spoCandidates.push({ name: `SPO (${r.name})`, totalSaving, rule: r, type: 'SPO', cheapestDates });
        });

        const winnerEB = ebCandidates.sort((a, b) => b.totalSaving - a.totalSaving)[0] || null;
        const winnerSPO = spoCandidates.sort((a, b) => b.totalSaving - a.totalSaving)[0] || null;

        // ─── PASS 3: Generate Response ───
        const breakdown: DailyRate[] = [];
        const stayModifiers: Array<{ name: string, amount: number }> = [];
        let totalDailyNet = 0;
        let totalDailyBrut = 0; 
        let totalDailyRemise = 0; 

        dailyData.forEach(day => {
            let promoSaving = 0;
            const appliedPromotions: Array<{ name: string, amount: number }> = [];

            if (day.line) {
                // A. Apply SPO First
                let nightNetAfterSPO = day.occupationalNet;
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
                        const matchesArrangement = r.applicableArrangements.length === 0 || r.applicableArrangements.some(aa => aa.arrangement?.id === dto.boardTypeId);
                        
                        if (matchesRoom && matchesPeriod && matchesArrangement) {
                            const spoCalcType = r.benefitType === SpoBenefitType.FIXED_DISCOUNT ? ReductionCalculationType.FIXED : ReductionCalculationType.PERCENTAGE;
                            const spoValue = Number(r.benefitValue !== null && r.benefitValue !== undefined ? r.benefitValue : r.value);
                            dailySposaving = this.calculateSaving(spoCalcType, spoValue, day.occupationalNet, r.applicationType, dto, totalNights);
                        }
                    }

                    if (dailySposaving > 0) {
                        appliedPromotions.push({ name: winnerSPO.name, amount: -dailySposaving });
                        promoSaving += dailySposaving;
                        nightNetAfterSPO = this.round(day.occupationalNet - dailySposaving, 3);
                    }
                }

                // B. Apply EB Second (on remaining amount)
                if (winnerEB && winnerEB.rule.applicationType !== PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
                    const r = winnerEB.rule;
                    const matchesBooking = (!r.bookingWindowStart || bookingDate >= this.dbDateToLocalMidnight(r.bookingWindowStart)!) && (!r.bookingWindowEnd || bookingDate <= this.dbDateToLocalMidnight(r.bookingWindowEnd)!);
                    const matchesStay = (!r.stayWindowStart || day.currentDate >= this.dbDateToLocalMidnight(r.stayWindowStart)!) && (!r.stayWindowEnd || day.currentDate <= this.dbDateToLocalMidnight(r.stayWindowEnd)!);
                    const matchesRoom = r.applicableContractRooms.length === 0 || r.applicableContractRooms.some(acr => acr.contractRoom?.id === day.line!.contractRoom.id);
                    const matchesPeriod = r.applicablePeriods.length === 0 || r.applicablePeriods.some(ap => ap.period?.id === day.line!.period.id);
                    
                    if (matchesBooking && matchesStay && matchesRoom && matchesPeriod) {
                        const ebSaving = this.calculateSaving(r.calculationType, Number(r.value), nightNetAfterSPO, r.applicationType, dto, totalNights);
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

            if (day.isAvailable && day.line) {
                allSupplements.filter(s => {
                    const matchesRoom = s.applicableContractRooms.length === 0 || s.applicableContractRooms.some(acr => acr.contractRoom?.id === day.line!.contractRoom.id);
                    const matchesPeriod = s.applicablePeriods.length === 0 || s.applicablePeriods.some(ap => ap.period?.id === day.line!.period.id);
                    const isForDate = !s.specificDate || s.specificDate === day.dateStr;
                    const isNotSingle = s.systemCode !== SupplementSystemCode.SINGLE_OCCUPANCY;
                    return s.isMandatory && matchesRoom && matchesPeriod && isForDate && isNotSingle;
                }).forEach(s => {
                    if (s.applicationType === PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
                        if (!stayModifiers.some(sm => sm.name === s.name)) {
                            stayModifiers.push({ name: s.name, amount: Number(s.value) });
                        }
                    } else {
                        let amount = Number(s.value);
                        
                        if (s.applicationType === PricingModifierApplicationType.PER_NIGHT_PER_PERSON) {
                            const minAge = s.minAge ?? 0;
                            const maxAge = s.maxAge ?? 99;
                            let eligiblePaxCount = 0;
                            if (maxAge > 17) eligiblePaxCount += dto.occupants.adults;
                            dto.occupants.childrenAges.forEach(age => {
                                if (age >= minAge && age <= maxAge) eligiblePaxCount++;
                            });
                            
                            if (eligiblePaxCount > 0) {
                                amount *= eligiblePaxCount;
                                supplementsApplied.push({ name: s.name, amount: this.round(amount, 3) });
                            }
                        } else {
                            supplementsApplied.push({ name: s.name, amount: this.round(amount, 3) });
                        }
                    }
                });
            }

            const dailySupplementsTotal = supplementsApplied.reduce((acc, c) => acc + c.amount, 0);
            const finalDailyRate = this.round(promoRate + dailySupplementsTotal, 3);
            const totalPax = dto.occupants.adults + dto.occupants.childrenAges.length;

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
            }
        });

        // ─── STAY TIER ───
        if (winnerSPO && winnerSPO.rule.applicationType === PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
            stayModifiers.push({ name: winnerSPO.name, amount: -winnerSPO.totalSaving });
        }
        if (winnerEB && winnerEB.rule.applicationType === PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
            // Business Rule: Recalculate EB if it depends on total stay amount (Waterfall)
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
        const finalGrossTotal = this.round(totalDailyNet + stayModifiersTotal, 3);

        return {
            contractId: dto.contractId,
            roomTypeId: dto.roomId,
            arrangementId: dto.boardTypeId,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            totalBrut: this.round(totalDailyBrut + stayModifiers.filter(sm => sm.amount > 0).reduce((acc, sm) => acc + sm.amount, 0), 3),
            totalRemise: this.round(totalDailyRemise + stayModifiers.filter(sm => sm.amount < 0).reduce((acc, sm) => acc + Math.abs(sm.amount), 0), 3),
            totalGross: finalGrossTotal,
            perAdultRate: dto.occupants.adults > 0 ? this.round(finalGrossTotal / dto.occupants.adults, 3) : 0,
            perNightRate: totalNights > 0 ? this.round(finalGrossTotal / totalNights, 3) : 0,
            currency: contract.currency,
            dailyBreakdown: breakdown,
            stayModifiers
        };
    }

    private round(value: number, precision: number): number {
        const factor = Math.pow(10, precision);
        return Math.round(value * factor) / factor;
    }

    private calculateSaving(
        type: ReductionCalculationType,
        value: number,
        rate: number,
        applicationType: PricingModifierApplicationType,
        dto: SimulationRequestDto,
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

        const totalPax = dto.occupants.adults + dto.occupants.childrenAges.length;
        if (applicationType === PricingModifierApplicationType.PER_NIGHT_PER_PERSON) {
            return this.round(baseSaving * totalPax, 3);
        }

        return this.round(baseSaving, 3);
    }

    private applyStandardReductions(
        dto: SimulationRequestDto,
        line: ContractLine,
        baseRate: number,
        allReductions: ContractReduction[],
        appliedList: Array<{ name: string, amount: number }>,
        totalNights: number
    ): number {
        let extraPaxTotal = 0;

        // 1. Extra Adults (3rd, 4th, etc.)
        for (let i = 3; i <= dto.occupants.adults; i++) {
            const extraRule = allReductions.find(r => {
                const matchesSystemCode = r.systemCode === ReductionSystemCode.EXTRA_ADULT;
                const matchesOrder = r.paxOrder === i;
                const matchesRoom = r.applicableContractRooms.length === 0 || r.applicableContractRooms.some(acr => acr.contractRoom?.id === line.contractRoom.id);
                const matchesPeriod = r.applicablePeriods.length === 0 || r.applicablePeriods.some(ap => ap.period?.id === line.period.id);
                return matchesSystemCode && matchesOrder && matchesRoom && matchesPeriod;
            });

            if (extraRule) {
                const reductionAmount = this.calculateReductionAmount(extraRule, baseRate, dto, totalNights);
                const extraAdultCost = this.round(baseRate + reductionAmount, 3);
                appliedList.push({ name: `Adulte ${i} Suppl.`, amount: extraAdultCost });
                extraPaxTotal += extraAdultCost;
            } else {
                const extraAdultCost = this.round(baseRate, 3);
                appliedList.push({ name: `Adulte ${i} Suppl. (Plein Tarif)`, amount: extraAdultCost });
                extraPaxTotal += extraAdultCost;
            }
        }

        // 2. Children
        dto.occupants.childrenAges.forEach((age, index) => {
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
                const reductionAmount = this.calculateReductionAmount(childRule, baseRate, dto, totalNights);
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

    private calculateReductionAmount(rule: ContractReduction, baseRate: number, dto: SimulationRequestDto, totalNights: number): number {
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

    /**
     * Converts a database date (usually UTC midnight) or an ISO string 
     * into a Local Date object at midnight, avoiding timezone shifts.
     */
    private dbDateToLocalMidnight(d: Date | string | null | undefined): Date | null {
        if (!d) return null;
        const date = new Date(d);
        if (isNaN(date.getTime())) return null;

        // Extract UTC components (which represent the intended YYYY-MM-DD for MSSQL DATE)
        const y = date.getUTCFullYear();
        const m = date.getUTCMonth();
        const day = date.getUTCDate();

        // Create a new Date in LOCAL midnight
        return new Date(y, m, day, 0, 0, 0, 0);
    }
}
