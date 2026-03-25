export class PromotionAppliedDto {
    name: string;
    amount: number;
}

export class ModifierDto {
    name: string;
    amount: number;
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
    roomTotalNet: number;
    dailyRates: DailyRateDto[];
}

export class SimulationResponseDto {
    contractId: number;
    checkIn: string;
    checkOut: string;
    currency: string;
    
    totalBrut: number;
    totalRemise: number;
    totalGross: number;
    totalNet: number;
    
    roomsBreakdown: RoomBreakdownDto[];
    stayModifiers: ModifierDto[];
}
