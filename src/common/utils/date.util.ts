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
    static isOverlap(start1: Date | string, end1: Date | string, start2: Date | string, end2: Date | string): boolean {
        const s1 = new Date(start1).getTime();
        const e1 = new Date(end1).getTime();
        const s2 = new Date(start2).getTime();
        const e2 = new Date(end2).getTime();
        return s1 <= e2 && s2 <= e1;
    }
}
