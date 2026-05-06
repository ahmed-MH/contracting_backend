import { Injectable } from '@nestjs/common';
import { Contract } from '../contract/core/entities/contract.entity';
import { ContractLine } from '../contract/core/entities/contract-line.entity';
import { ContractReduction } from '../contract/reduction/entities/contract-reduction.entity';
import { ContractMonoparentalRule } from '../contract/monoparental/entities/contract-monoparental-rule.entity';
import { ContractEarlyBooking } from '../contract/early-booking/entities/contract-early-booking.entity';
import { ContractSpo } from '../contract/spo/entities/contract-spo.entity';
import { ContractSupplement } from '../contract/supplement/entities/contract-supplement.entity';
import { AffiliateEmailSpo } from '../affiliate/email-spo/entities/affiliate-email-spo.entity';
import { OccupantType, RoomingItemDto } from './dto/simulation-request.dto';
import { DailyRateDto, PricingTraceDto } from './dto/simulation-response.dto';
import {
    AffiliateEmailSpoApplicationStep,
    AffiliateEmailSpoStackMode,
    BaseRateType,
    ChildSurchargeBase,
    PricingModifierApplicationType,
    ReductionCalculationType,
    ReductionSystemCode,
    SpoBenefitType,
    SpoConditionType,
    SupplementCalculationType,
    SupplementSystemCode,
} from '../../common/constants/enums';

type PricingStage =
    | 'base_rate'
    | 'occupancy'
    | 'promotion_selection'
    | 'spo'
    | 'early_booking'
    | 'email_spo'
    | 'board_meal_plan'
    | 'mandatory_supplements'
    | 'stay_adjustments'
    | 'room_total';

interface BestPromotion {
    name: string;
    totalSaving: number;
    rule: any;
    type: 'EB' | 'SPO';
    cheapestDates?: string[];
}

type DiscountSourceType = 'SPO' | 'EARLY_BOOKING';
type DiscountType = 'percentage' | 'fixed' | 'free_night';
type DiscountBase = 'base_amount' | 'running_subtotal';

interface RollingDiscount {
    sourceType: DiscountSourceType;
    sourceId?: number;
    label: string;
    type: DiscountType;
    base: DiscountBase;
    order: number;
    exclusiveGroup?: 'best_spo' | 'best_early_booking';
    value: number;
    applicationType: PricingModifierApplicationType;
    freeDates?: string[];
}

interface RollingDiscountApplication {
    discount: RollingDiscount;
    beforeAmount: number;
    deltaAmount: number;
    afterAmount: number;
}

interface TraceStageDescriptor {
    stage: PricingStage;
    label: string;
    deltaAmount: number;
    metadata?: Record<string, unknown>;
    sourceId?: number;
    sourceType?: string;
    extras?: Partial<PricingTraceDto>;
}

interface EmailSpoApplication {
    stageDescriptor: TraceStageDescriptor;
    stayModifier: { name: string; amount: number };
    discountAmount: number;
}

export interface PricingEngineRoomInput {
    roomIndex: number;
    roomItem: RoomingItemDto;
    boardTypeId: number;
    contract: Contract;
    lines: ContractLine[];
    allReductions: ContractReduction[];
    allMonoparentalRules: ContractMonoparentalRule[];
    allEarlyBookings: ContractEarlyBooking[];
    allSpos: ContractSpo[];
    allSupplements: ContractSupplement[];
    emailSpo?: AffiliateEmailSpo | null;
    startDate: Date;
    totalNights: number;
    bookingDate: Date;
    leadTime: number;
}

export interface PricingEngineRoomResult {
    totalBrut: number;
    totalRemise: number;
    totalGross: number;
    breakdown: {
        roomIndex: number;
        roomId: number;
        boardTypeId: number;
        roomTotalNet: number;
        dailyRates: DailyRateDto[];
        pricingTrace: PricingTraceDto[];
    };
    stayModifiers: Array<{ name: string; amount: number }>;
}

@Injectable()
export class PricingEngineService {
    calculateRoom(input: PricingEngineRoomInput): PricingEngineRoomResult {
        const {
            roomIndex,
            roomItem,
            boardTypeId,
            contract,
            lines,
            allReductions,
            allMonoparentalRules,
            allEarlyBookings,
            allSpos,
            allSupplements,
            emailSpo,
            startDate,
            totalNights,
            bookingDate,
            leadTime,
        } = input;

        const adultAges = roomItem.occupants.filter(o => o.type === OccupantType.ADULT).map(o => o.age);
        const adultsCount = adultAges.length;
        const childrenAges = roomItem.occupants.filter(o => o.type === OccupantType.CHILD || o.type === OccupantType.INFANT).map(o => o.age);
        const occupants = { adults: adultsCount, childrenAges };

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
        let totalBaseRate = 0;

        for (let i = 0; i < totalNights; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const dayStr = String(currentDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${dayStr}`;

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
                    totalBaseRate += baseRate;
                    let nightNet = 0;
                    const reductionsApplied: Array<{ name: string, amount: number }> = [];
                    let isMonoparentalApplied = false;

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

        allSpos.forEach(r => {
            let totalSaving = 0;
            const stayDuration = totalNights;
            const spoValue = this.resolveSpoValue(r);

            if (r.conditionType === SpoConditionType.MIN_NIGHTS || r.conditionType === SpoConditionType.LONG_STAY) {
                if (r.conditionValue && stayDuration < r.conditionValue) return;
            }
            if (r.conditionType === SpoConditionType.AGE) {
                if (!r.conditionValue || !adultAges.some(age => age >= Number(r.conditionValue))) return;
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

        const breakdown: DailyRateDto[] = [];
        const stayModifiers: Array<{ name: string, amount: number }> = [];
        const eventModifiers: Array<{ name: string, amount: number }> = [];
        let totalDailyNet = 0;
        let totalDailyBrut = 0;
        let totalDailyRemise = 0;
        let totalSpoSaving = 0;
        let totalEarlyBookingSaving = 0;
        let totalBoardMealPlanSupplements = 0;
        let totalMandatorySupplements = 0;
        let promotionSubtotalAfterDailyDiscounts = 0;

        dailyData.forEach(day => {
            const dailyDiscounts = this.buildDailyRollingDiscounts({
                day,
                winnerSPO,
                winnerEB,
                boardTypeId,
                bookingDate,
            });
            const dailyDiscountApplications = this.applyRollingDiscounts(day.occupationalNet, dailyDiscounts, occupants, totalNights);
            const appliedPromotions = dailyDiscountApplications.map(application => ({
                name: application.discount.label,
                amount: application.deltaAmount,
            }));
            const promoSaving = this.round(-appliedPromotions.reduce((acc, p) => acc + p.amount, 0), 3);

            dailyDiscountApplications.forEach(application => {
                if (application.discount.sourceType === 'SPO') {
                    totalSpoSaving += -application.deltaAmount;
                } else {
                    totalEarlyBookingSaving += -application.deltaAmount;
                }
            });

            const promotionApplied = appliedPromotions.length > 0 ? {
                name: appliedPromotions.map(p => p.name).join(' + '),
                amount: appliedPromotions.reduce((acc, p) => acc + p.amount, 0)
            } : null;

            const lastDiscountApplication = dailyDiscountApplications[dailyDiscountApplications.length - 1];
            const promoRate = lastDiscountApplication ? lastDiscountApplication.afterAmount : day.occupationalNet;
            promotionSubtotalAfterDailyDiscounts += promoRate;
            const supplementsApplied: Array<{ name: string, amount: number }> = [];
            const eventSupplementsForDay: Array<{ name: string, amount: number }> = [];

            if (day.isAvailable && day.line) {
                allSupplements.filter(s => {
                    const matchesRoom = s.applicableContractRooms.length === 0 || s.applicableContractRooms.some(acr => acr.contractRoom?.id === day.line!.contractRoom.id);
                    const matchesPeriod = s.applicablePeriods.length === 0 || s.applicablePeriods.some(ap => ap.period?.id === day.line!.period.id);
                    const isForDate = !s.specificDate || s.specificDate === day.dateStr;
                    const isNotSingle = s.systemCode !== SupplementSystemCode.SINGLE_OCCUPANCY;
                    const matchesSelectedMealPlan = this.matchesSelectedMealPlan(s, boardTypeId, contract);
                    return s.isMandatory && matchesRoom && matchesPeriod && isForDate && isNotSingle && matchesSelectedMealPlan;
                }).forEach(s => {
                    const supplementBaseValue = this.supplementValueForPeriod(s, day.line!.period.id);
                    if (s.applicationType === PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
                        if (!stayModifiers.some(sm => sm.name === s.name)) {
                            stayModifiers.push({ name: s.name, amount: supplementBaseValue });
                        }
                    } else {
                        let amount = supplementBaseValue;

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
                                    const roundedAmount = this.round(amount, 3);
                                    supplementsApplied.push({ name: s.name, amount: roundedAmount });
                                    if (s.systemCode === SupplementSystemCode.MEAL_PLAN) totalBoardMealPlanSupplements += roundedAmount;
                                    else totalMandatorySupplements += roundedAmount;
                                }
                            }
                        } else {
                            if (s.specificDate) {
                                eventSupplementsForDay.push({ name: s.name, amount: this.round(amount, 3) });
                            } else {
                                const roundedAmount = this.round(amount, 3);
                                supplementsApplied.push({ name: s.name, amount: roundedAmount });
                                if (s.systemCode === SupplementSystemCode.MEAL_PLAN) totalBoardMealPlanSupplements += roundedAmount;
                                else totalMandatorySupplements += roundedAmount;
                            }
                        }
                    }
                });
            }

            const dailySupplementsTotal = supplementsApplied.reduce((acc, c) => acc + c.amount, 0);
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

        const flatDiscountApplications = this.applyRollingDiscounts(
            promotionSubtotalAfterDailyDiscounts,
            this.buildFlatStayRollingDiscounts(winnerSPO, winnerEB),
            occupants,
            totalNights,
        );
        let flatSpoSaving = 0;
        let flatEarlyBookingSaving = 0;
        flatDiscountApplications.forEach(application => {
            stayModifiers.push({ name: application.discount.label, amount: application.deltaAmount });
            if (application.discount.sourceType === 'SPO') {
                flatSpoSaving += -application.deltaAmount;
            } else {
                flatEarlyBookingSaving += -application.deltaAmount;
            }
        });

        const stageSequence: TraceStageDescriptor[] = [
            {
                stage: 'base_rate',
                label: 'Base room rates selected',
                deltaAmount: totalBaseRate,
                metadata: {
                    roomId: roomItem.roomId,
                    nights: totalNights,
                },
            },
            {
                stage: 'occupancy',
                label: 'Occupancy, single, monoparental and pax reductions',
                deltaAmount: totalOccupationalSum - totalBaseRate,
                metadata: {
                    adults: occupants.adults,
                    children: occupants.childrenAges.length,
                },
            },
            {
                stage: 'promotion_selection',
                label: 'Best EB and SPO candidates selected',
                deltaAmount: 0,
                metadata: {
                    earlyBooking: winnerEB ? { name: winnerEB.name, totalSaving: winnerEB.totalSaving, id: winnerEB.rule?.id } : null,
                    spo: winnerSPO ? { name: winnerSPO.name, totalSaving: winnerSPO.totalSaving, id: winnerSPO.rule?.id } : null,
                },
            },
            {
                stage: 'spo',
                label: winnerSPO?.name ?? 'No SPO applied',
                deltaAmount: -(totalSpoSaving + flatSpoSaving),
                metadata: {
                    winner: winnerSPO?.name ?? null,
                    base: 'running_subtotal',
                    order: 10,
                },
                sourceId: winnerSPO?.rule?.id,
                sourceType: winnerSPO ? 'SPO' : undefined,
            },
            {
                stage: 'early_booking',
                label: winnerEB?.name ?? 'No early booking applied',
                deltaAmount: -(totalEarlyBookingSaving + flatEarlyBookingSaving),
                metadata: {
                    winner: winnerEB?.name ?? null,
                    base: 'running_subtotal',
                    order: 20,
                },
                sourceId: winnerEB?.rule?.id,
                sourceType: winnerEB ? 'EARLY_BOOKING' : undefined,
            },
            {
                stage: 'board_meal_plan',
                label: 'Board / meal-plan supplements',
                deltaAmount: totalBoardMealPlanSupplements,
                metadata: { boardTypeId },
            },
            {
                stage: 'mandatory_supplements',
                label: 'Other mandatory supplements',
                deltaAmount: totalMandatorySupplements,
            },
        ];

        const emailSpoApplication = emailSpo
            ? this.buildEmailSpoApplication(stageSequence, emailSpo)
            : null;
        const emailSpoInsertionIndex = emailSpo ? this.emailSpoInsertionIndex(emailSpo.applicationStep) : null;

        if (emailSpoApplication && emailSpoInsertionIndex !== null) {
            stayModifiers.push(emailSpoApplication.stayModifier);
            stageSequence.splice(
                emailSpoInsertionIndex,
                0,
                emailSpoApplication.stageDescriptor,
            );
        }

        const emailSpoDiscount = emailSpoApplication?.discountAmount ?? 0;
        const stayModifiersTotal = stayModifiers.reduce((acc, sm) => acc + sm.amount, 0);
        const eventModifiersTotal = eventModifiers.reduce((acc, em) => acc + em.amount, 0);
        const finalGrossTotal = this.round(totalDailyNet + stayModifiersTotal + eventModifiersTotal, 3);
        const nonPromotionStayModifiersTotal = stayModifiersTotal + flatSpoSaving + flatEarlyBookingSaving + emailSpoDiscount;
        const adjustmentDelta = nonPromotionStayModifiersTotal + eventModifiersTotal;
        stageSequence.push({
            stage: 'stay_adjustments',
            label: 'Stay and event adjustments',
            deltaAmount: adjustmentDelta,
        });

        const pricingTrace = this.buildPricingTrace(stageSequence, finalGrossTotal);

        return {
            totalBrut: totalDailyBrut,
            totalRemise: this.round(totalDailyRemise + emailSpoDiscount, 3),
            totalGross: finalGrossTotal,
            breakdown: {
                roomIndex,
                roomId: roomItem.roomId,
                boardTypeId,
                roomTotalNet: finalGrossTotal,
                dailyRates: breakdown,
                pricingTrace,
            },
            stayModifiers: [...stayModifiers, ...eventModifiers]
        };
    }

    private buildDailyRollingDiscounts(params: {
        day: {
            dateStr: string;
            currentDate: Date;
            occupationalNet: number;
            line: ContractLine | null;
            isAvailable: boolean;
        };
        winnerSPO: BestPromotion | null;
        winnerEB: BestPromotion | null;
        boardTypeId: number;
        bookingDate: Date;
    }): RollingDiscount[] {
        const { day, winnerSPO, winnerEB, boardTypeId, bookingDate } = params;
        if (!day.isAvailable || !day.line) return [];

        const discounts: RollingDiscount[] = [];

        if (winnerSPO && winnerSPO.rule.applicationType !== PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
            const r = winnerSPO.rule;
            const matchesRoom = r.applicableContractRooms.length === 0 || r.applicableContractRooms.some((csr: any) => csr.contractRoom?.id === day.line!.contractRoom.id);
            const matchesPeriod = r.applicablePeriods.length === 0 || r.applicablePeriods.some((ap: any) => ap.period?.id === day.line!.period.id);
            const matchesArrangement = r.applicableArrangements.length === 0 || r.applicableArrangements.some((aa: any) => aa.arrangement?.id === boardTypeId);

            if (matchesRoom && matchesPeriod && matchesArrangement) {
                if (r.benefitType === SpoBenefitType.FREE_NIGHTS) {
                    if (winnerSPO.cheapestDates?.includes(day.dateStr)) {
                        discounts.push({
                            sourceType: 'SPO',
                            sourceId: r.id,
                            label: winnerSPO.name,
                            type: 'free_night',
                            base: 'running_subtotal',
                            order: 10,
                            exclusiveGroup: 'best_spo',
                            value: 100,
                            applicationType: r.applicationType,
                            freeDates: winnerSPO.cheapestDates,
                        });
                    }
                } else {
                    discounts.push({
                        sourceType: 'SPO',
                        sourceId: r.id,
                        label: winnerSPO.name,
                        type: r.benefitType === SpoBenefitType.FIXED_DISCOUNT ? 'fixed' : 'percentage',
                        base: 'running_subtotal',
                        order: 10,
                        exclusiveGroup: 'best_spo',
                        value: this.resolveSpoValue(r),
                        applicationType: r.applicationType,
                    });
                }
            }
        }

        if (winnerEB && winnerEB.rule.applicationType !== PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
            const r = winnerEB.rule;
            const matchesBooking = (!r.bookingWindowStart || bookingDate >= this.dbDateToLocalMidnight(r.bookingWindowStart)!) && (!r.bookingWindowEnd || bookingDate <= this.dbDateToLocalMidnight(r.bookingWindowEnd)!);
            const matchesStay = (!r.stayWindowStart || day.currentDate >= this.dbDateToLocalMidnight(r.stayWindowStart)!) && (!r.stayWindowEnd || day.currentDate <= this.dbDateToLocalMidnight(r.stayWindowEnd)!);
            const matchesRoom = r.applicableContractRooms.length === 0 || r.applicableContractRooms.some((acr: any) => acr.contractRoom?.id === day.line!.contractRoom.id);
            const matchesPeriod = r.applicablePeriods.length === 0 || r.applicablePeriods.some((ap: any) => ap.period?.id === day.line!.period.id);

            if (matchesBooking && matchesStay && matchesRoom && matchesPeriod) {
                discounts.push({
                    sourceType: 'EARLY_BOOKING',
                    sourceId: r.id,
                    label: winnerEB.name,
                    type: r.calculationType === ReductionCalculationType.FIXED ? 'fixed' : r.calculationType === ReductionCalculationType.FREE ? 'free_night' : 'percentage',
                    base: 'running_subtotal',
                    order: 20,
                    exclusiveGroup: 'best_early_booking',
                    value: Number(r.value),
                    applicationType: r.applicationType,
                });
            }
        }

        return discounts;
    }

    private buildFlatStayRollingDiscounts(winnerSPO: BestPromotion | null, winnerEB: BestPromotion | null): RollingDiscount[] {
        const discounts: RollingDiscount[] = [];

        if (winnerSPO && winnerSPO.rule.applicationType === PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
            const r = winnerSPO.rule;
            discounts.push({
                sourceType: 'SPO',
                sourceId: r.id,
                label: winnerSPO.name,
                type: r.benefitType === SpoBenefitType.FIXED_DISCOUNT ? 'fixed' : r.benefitType === SpoBenefitType.FREE_NIGHTS ? 'free_night' : 'percentage',
                base: 'running_subtotal',
                order: 10,
                exclusiveGroup: 'best_spo',
                value: this.resolveSpoValue(r),
                applicationType: r.applicationType,
            });
        }

        if (winnerEB && winnerEB.rule.applicationType === PricingModifierApplicationType.FLAT_RATE_PER_STAY) {
            const r = winnerEB.rule;
            discounts.push({
                sourceType: 'EARLY_BOOKING',
                sourceId: r.id,
                label: winnerEB.name,
                type: r.calculationType === ReductionCalculationType.FIXED ? 'fixed' : r.calculationType === ReductionCalculationType.FREE ? 'free_night' : 'percentage',
                base: 'running_subtotal',
                order: 20,
                exclusiveGroup: 'best_early_booking',
                value: Number(r.value),
                applicationType: r.applicationType,
            });
        }

        return discounts;
    }

    private applyRollingDiscounts(
        startingAmount: number,
        discounts: RollingDiscount[],
        occupants: { adults: number, childrenAges: number[] },
        totalNights: number,
    ): RollingDiscountApplication[] {
        const applications: RollingDiscountApplication[] = [];
        let runningAmount = this.round(startingAmount, 3);

        [...discounts].sort((a, b) => a.order - b.order).forEach(discount => {
            const baseAmount = discount.base === 'base_amount' ? startingAmount : runningAmount;
            const discountAmount = this.calculateDiscountAmount(discount, baseAmount, occupants, totalNights);
            if (discountAmount <= 0) return;

            const beforeAmount = runningAmount;
            const afterAmount = this.round(runningAmount - discountAmount, 3);
            const deltaAmount = this.round(afterAmount - beforeAmount, 3);

            applications.push({
                discount,
                beforeAmount,
                deltaAmount,
                afterAmount,
            });
            runningAmount = afterAmount;
        });

        return applications;
    }

    private calculateDiscountAmount(
        discount: RollingDiscount,
        baseAmount: number,
        occupants: { adults: number, childrenAges: number[] },
        totalNights: number,
    ): number {
        if (discount.type === 'percentage') {
            return this.round((discount.value / 100) * baseAmount, 3);
        }
        if (discount.type === 'free_night') {
            return this.round(baseAmount, 3);
        }
        return this.calculateSaving(ReductionCalculationType.FIXED, discount.value, baseAmount, discount.applicationType, occupants, totalNights);
    }

    private resolveSpoValue(rule: ContractSpo): number {
        const rawBenefitValue = rule.benefitValue !== null && rule.benefitValue !== undefined ? Number(rule.benefitValue) : 0;
        const rawValue = rule.value !== null && rule.value !== undefined ? Number(rule.value) : 0;

        if (rawBenefitValue === 1 && rawValue > 1) return rawValue;
        if (rawBenefitValue === 0 && rawValue > 0) return rawValue;
        return rawBenefitValue;
    }

    private buildPricingTrace(stageSequence: TraceStageDescriptor[], finalGrossTotal: number): PricingTraceDto[] {
        const trace: PricingTraceDto[] = [];
        let runningAmount = 0;

        stageSequence.forEach((stageDescriptor) => {
            trace.push(this.createTrace(stageDescriptor, runningAmount));
            runningAmount = this.round(runningAmount + stageDescriptor.deltaAmount, 3);
        });

        trace.push(this.createTrace({
            stage: 'room_total',
            label: 'Room total finalization',
            deltaAmount: finalGrossTotal - runningAmount,
        }, runningAmount));

        return trace;
    }

    private createTrace(stageDescriptor: TraceStageDescriptor, beforeAmount: number): PricingTraceDto {
        return {
            stage: stageDescriptor.stage,
            label: stageDescriptor.label,
            beforeAmount: this.round(beforeAmount, 3),
            deltaAmount: this.round(stageDescriptor.deltaAmount, 3),
            afterAmount: this.round(beforeAmount + stageDescriptor.deltaAmount, 3),
            sourceType: stageDescriptor.sourceType,
            sourceId: stageDescriptor.sourceId,
            metadata: stageDescriptor.metadata,
            ...stageDescriptor.extras,
        };
    }

    private buildEmailSpoApplication(
        stageSequence: TraceStageDescriptor[],
        emailSpo: AffiliateEmailSpo,
    ): EmailSpoApplication | null {
        const insertionIndex = this.emailSpoInsertionIndex(emailSpo.applicationStep);
        let runningAmount = 0;
        let previousStageBeforeAmount = 0;
        let previousStageDeltaAmount = 0;

        for (let i = 0; i < insertionIndex; i++) {
            previousStageBeforeAmount = runningAmount;
            previousStageDeltaAmount = stageSequence[i]?.deltaAmount ?? 0;
            runningAmount = this.round(runningAmount + (stageSequence[i]?.deltaAmount ?? 0), 3);
        }

        const rollingBaseAmount = runningAmount;
        const cumulativeBaseAmount = previousStageDeltaAmount < 0 ? previousStageBeforeAmount : rollingBaseAmount;
        const baseAmount = emailSpo.stackMode === AffiliateEmailSpoStackMode.CUMULATIVE
            ? cumulativeBaseAmount
            : rollingBaseAmount;
        const percent = Number(emailSpo.discountPercent);
        const discountAmount = this.round((percent / 100) * baseAmount, 3);

        if (discountAmount <= 0) {
            return null;
        }

        const label = `Email SPO (${emailSpo.name})`;
        const applicationStepLabel = this.emailSpoStepLabel(emailSpo.applicationStep);

        return {
            stageDescriptor: {
                stage: 'email_spo',
                label,
                deltaAmount: -discountAmount,
                sourceId: emailSpo.id,
                sourceType: 'EMAIL_SPO',
                metadata: {
                    name: emailSpo.name,
                    percent,
                    stackMode: emailSpo.stackMode,
                    applicationStep: emailSpo.applicationStep,
                    applicationStepLabel,
                    baseAmount,
                    discountAmount,
                },
                extras: {
                    type: 'EMAIL_SPO',
                    percent,
                    stackMode: emailSpo.stackMode,
                    applicationStep: emailSpo.applicationStep,
                    baseAmount,
                    discountAmount,
                },
            },
            stayModifier: {
                name: label,
                amount: -discountAmount,
            },
            discountAmount,
        };
    }

    private emailSpoInsertionIndex(applicationStep: AffiliateEmailSpoApplicationStep): number {
        switch (applicationStep) {
            case AffiliateEmailSpoApplicationStep.AFTER_BASE_RATE:
                return 1;
            case AffiliateEmailSpoApplicationStep.AFTER_REDUCTION:
            case AffiliateEmailSpoApplicationStep.AFTER_MONOPARENTAL:
                return 2;
            case AffiliateEmailSpoApplicationStep.AFTER_CONTRACT_SPO:
                return 4;
            case AffiliateEmailSpoApplicationStep.AFTER_EARLY_BOOKING:
                return 5;
            case AffiliateEmailSpoApplicationStep.AFTER_BOARD_SUPPLEMENT:
                return 6;
            case AffiliateEmailSpoApplicationStep.AFTER_SUPPLEMENT:
            default:
                return 7;
        }
    }

    private emailSpoStepLabel(applicationStep: AffiliateEmailSpoApplicationStep): string {
        switch (applicationStep) {
            case AffiliateEmailSpoApplicationStep.AFTER_BASE_RATE:
                return 'After base rate';
            case AffiliateEmailSpoApplicationStep.AFTER_BOARD_SUPPLEMENT:
                return 'After board supplement';
            case AffiliateEmailSpoApplicationStep.AFTER_SUPPLEMENT:
                return 'After supplement';
            case AffiliateEmailSpoApplicationStep.AFTER_REDUCTION:
                return 'After reduction';
            case AffiliateEmailSpoApplicationStep.AFTER_MONOPARENTAL:
                return 'After monoparental';
            case AffiliateEmailSpoApplicationStep.AFTER_EARLY_BOOKING:
                return 'After early booking';
            case AffiliateEmailSpoApplicationStep.AFTER_CONTRACT_SPO:
            default:
                return 'After contract SPO';
        }
    }

    private selectBasePrice(line: ContractLine, baseArrangementId?: number | null) {
        if (!line.prices?.length) return null;
        if (!baseArrangementId) return line.prices[0];
        return line.prices.find((price) => price.arrangement?.id === baseArrangementId) ?? line.prices[0];
    }

    private matchesSelectedMealPlan(supplement: ContractSupplement, boardTypeId: number, contract: Contract): boolean {
        if (supplement.systemCode !== SupplementSystemCode.MEAL_PLAN) return true;
        const targetArrangementId = supplement.targetArrangement?.id ?? supplement.targetArrangementId;
        if (!targetArrangementId) return true;
        if (!boardTypeId || boardTypeId === contract.baseArrangementId) return false;
        return targetArrangementId === boardTypeId;
    }

    private findSupplementPeriodTarget(supplement: ContractSupplement, periodId: number): any | undefined {
        return supplement.applicablePeriods?.find((target: any) => target.period?.id === periodId || target.periodId === periodId);
    }

    private supplementValueForPeriod(supplement: ContractSupplement, periodId: number): number {
        const periodTarget = this.findSupplementPeriodTarget(supplement, periodId);
        return Number(periodTarget?.overrideValue ?? supplement.value ?? 0) || 0;
    }

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
