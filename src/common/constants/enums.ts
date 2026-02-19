export enum UserRole {
    ADMIN = 'ADMIN',
    COMMERCIAL = 'COMMERCIAL',
    AGENT = 'AGENT',
}

export enum ContractStatus {
    DRAFT = 'DRAFT',
    ACTIVE = 'ACTIVE',
    EXPIRED = 'EXPIRED',
    TERMINATED = 'TERMINATED',
}

export enum PaymentType {
    PREPAYMENT = 'Prepayment',
    BANK_TRANSFER = 'Bank Transfer',
}

export enum SupplementType {
    PER_NIGHT = 'PerNight',
    PER_STAY = 'PerStay',
    PER_PAX = 'PerPax',
}

export enum AuthType {
    API_KEY = 'API_KEY',
    BEARER_TOKEN = 'BEARER_TOKEN',
    BASIC_AUTH = 'BASIC_AUTH',
}

export enum DiscountType {
    PERCENTAGE = 'PERCENTAGE',
    AMOUNT = 'AMOUNT',
    FREE = 'FREE',
}

export enum SupplementValueType {
    PERCENTAGE = 'PERCENTAGE',
    AMOUNT = 'AMOUNT',
    FORMULA = 'FORMULA',
    FREE = 'FREE',
}
