export interface ActivationValidationIssue {
    code: string;
    message: string;
    details?: unknown;
}

export interface ActivationDateRange {
    startDate: string;
    endDate: string;
}

export interface ActivationMissingRate {
    periodId: number;
    periodName: string;
    contractRoomId: number;
    roomName: string;
}

export interface ActivationValidationSummary {
    missingPeriods: boolean;
    uncoveredDateRanges: ActivationDateRange[];
    missingRooms: boolean;
    missingRates: ActivationMissingRate[];
    invalidTargets: ActivationValidationIssue[];
}

export interface ActivationValidationResult {
    isValid: boolean;
    errors: ActivationValidationIssue[];
    warnings: ActivationValidationIssue[];
    summary: ActivationValidationSummary;
}
