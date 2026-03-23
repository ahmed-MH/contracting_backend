export interface DailyRate {
    date: string;
    baseRate: number; // Unitary price (per person)
    reductionsApplied: Array<{ name: string, amount: number }>;
    netRate: number; // Night net for the room
    promotionApplied: { name: string, amount: number } | null;
    promoRate: number;
    supplementsApplied: Array<{ name: string, amount: number }>;
    finalDailyRate: number; // Total for the room this night
    perPersonRate: number; // finalDailyRate / totalOccupants
    currency: string;
    isAvailable: boolean;
    reason?: string;
}

export interface SimulationResponse {
    contractId: number;
    roomTypeId: number;
    arrangementId: number;
    checkIn: string;
    checkOut: string;
    totalBrut: number;
    totalRemise: number;
    totalGross: number; // Total for the room for the stay
    perAdultRate: number; // totalGross / totalAdults
    perNightRate: number; // totalGross / totalNights
    currency: string;
    dailyBreakdown: DailyRate[];
    stayModifiers: Array<{ name: string, amount: number }>;
}
