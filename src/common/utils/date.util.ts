/**
 * Utility class for date operations used across the contract/pricing domain.
 * Centralizes date logic to avoid duplication in services.
 */
export class DateUtil {
    /**
     * Determines whether two date ranges overlap.
     * Two ranges [start1, end1] and [start2, end2] overlap if start1 <= end2 AND start2 <= end1.
     *
     * @param start1 - Start of the first range
     * @param end1   - End of the first range
     * @param start2 - Start of the second range
     * @param end2   - End of the second range
     * @returns true if the two date ranges overlap, false otherwise
     */
    static isOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
        return start1 <= end2 && start2 <= end1;
    }
}
