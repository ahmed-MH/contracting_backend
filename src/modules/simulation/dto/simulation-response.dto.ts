export class PromotionAppliedDto {
    name: string;
    amount: number;
}

export class ModifierDto {
    name: string;
    amount: number;
}

export class PricingTraceDto {
    stage: string;
    label: string;
    beforeAmount: number;
    deltaAmount: number;
    afterAmount: number;
    type?: string;
    percent?: number;
    stackMode?: string;
    applicationStep?: string;
    baseAmount?: number;
    discountAmount?: number;
    sourceType?: string;
    sourceId?: number;
    metadata?: Record<string, unknown>;
}

export class DailyRateDto {
    date: string;
    baseRate: number;
    reductionsApplied: ModifierDto[];
    netRate: number;
    promotionApplied: PromotionAppliedDto | null;
    promoRate: number;
    supplementsApplied: ModifierDto[];
    finalDailyRate: number;
    perPersonRate: number;
    currency: string;
    isAvailable: boolean;
    reason?: string;
}

export class RoomBreakdownDto {
    roomIndex: number;
    roomId: number;
    boardTypeId: number;
    roomTotalNet: number;
    dailyRates: DailyRateDto[];
    pricingTrace: PricingTraceDto[];
}

export class InactiveContractOverrideDto {
    enabled: boolean;
    contractStatus: string;
    reason?: string;
}

export class SimulationResponseDto {
    contractId: number;
    contractStatus: string;
    checkIn: string;
    checkOut: string;
    currency: string;
    inactiveContractOverride?: InactiveContractOverrideDto;
    
    totalBrut: number;
    totalRemise: number;
    totalGross: number;
    totalNet: number;
    
    roomsBreakdown: RoomBreakdownDto[];
    stayModifiers: ModifierDto[];
}
