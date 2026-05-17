export type IntegrationErrorCode =
    | 'INVALID_API_KEY'
    | 'ENDPOINT_DISABLED'
    | 'API_ACCESS_DISABLED'
    | 'RATE_LIMIT_EXCEEDED'
    | 'API_USER_INACTIVE'
    | 'PERMISSION_DENIED'
    | 'IP_NOT_ALLOWED'
    | 'HOTEL_NOT_ALLOWED'
    | 'INVALID_PAYLOAD'
    | 'HOTEL_NOT_FOUND'
    | 'PARTNER_NOT_FOUND'
    | 'ROOM_TYPE_NOT_FOUND'
    | 'BOARD_NOT_FOUND'
    | 'NO_ACTIVE_CONTRACT'
    | 'MISSING_RATE'
    | 'STOP_SALE_ACTIVE'
    | 'MIN_STAY_NOT_SATISFIED'
    | 'RELEASE_DAYS_NOT_SATISFIED'
    | 'CURRENCY_CONVERSION_MISSING'
    | 'INTERNAL_ERROR';

export class IntegrationPublicError extends Error {
    constructor(
        public readonly errorCode: IntegrationErrorCode,
        public readonly statusCode: number,
        message: string,
    ) {
        super(message);
    }
}
