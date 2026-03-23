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

export enum AffiliateType {
    TOUR_OPERATOR = 'TOUR_OPERATOR',
    TRAVEL_AGENCY = 'TRAVEL_AGENCY',
    CORPORATE = 'CORPORATE',
}

export enum PaymentConditionType {
    DEPOSIT = 'DEPOSIT',
    PREPAYMENT_100 = 'PREPAYMENT_100',
}

export enum PaymentMethodType {
    BANK_TRANSFER = 'BANK_TRANSFER',
    BANK_CHECK = 'BANK_CHECK',
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

export enum SupplementCalculationType {
    FIXED = 'FIXED',
    PERCENTAGE = 'PERCENTAGE',
    FORMULA = 'FORMULA',
    FREE = 'FREE',
}

export enum PricingModifierApplicationType {
    PER_NIGHT_PER_PERSON = 'PER_NIGHT_PER_PERSON',
    PER_NIGHT_PER_ROOM = 'PER_NIGHT_PER_ROOM',
    FLAT_RATE_PER_STAY = 'FLAT_RATE_PER_STAY',
}

export enum ReductionCalculationType {
    FIXED = 'FIXED',
    PERCENTAGE = 'PERCENTAGE',
    FREE = 'FREE',
}

export enum PaxType {
    FIRST_CHILD = 'FIRST_CHILD',
    SECOND_CHILD = 'SECOND_CHILD',
    THIRD_CHILD = 'THIRD_CHILD',
    THIRD_ADULT = 'THIRD_ADULT',
}

export enum SupplementSystemCode {
    SINGLE_OCCUPANCY = 'SINGLE_OCCUPANCY',
    GALA_DINNER = 'GALA_DINNER',
    MEAL_PLAN = 'MEAL_PLAN',
    CUSTOM = 'CUSTOM',
}

export enum ReductionSystemCode {
    EXTRA_ADULT = 'EXTRA_ADULT',
    CHILD = 'CHILD',
    CUSTOM = 'CUSTOM',
}

// ─── Monoparental Rules ──────────────────────────────────────────────

export enum BaseRateType {
    SINGLE = 'SINGLE',
    DOUBLE = 'DOUBLE',
    TRIPLE = 'TRIPLE',
}

export enum ChildSurchargeBase {
    SINGLE = 'SINGLE',
    DOUBLE = 'DOUBLE',
    HALF_SINGLE = 'HALF_SINGLE',
    HALF_DOUBLE = 'HALF_DOUBLE',
}

// ─── Special Offers (SPO) ──────────────────────────────────────────────

export enum SpoConditionType {
    MIN_NIGHTS = 'MIN_NIGHTS',
    HONEYMOONER = 'HONEYMOONER',
    EARLY_BIRD = 'EARLY_BIRD',
    LONG_STAY = 'LONG_STAY',
    NONE = 'NONE'
}

export enum SpoBenefitType {
    PERCENTAGE_DISCOUNT = 'PERCENTAGE_DISCOUNT',
    FIXED_DISCOUNT = 'FIXED_DISCOUNT',
    FREE_NIGHTS = 'FREE_NIGHTS',
    FREE_ROOM_UPGRADE = 'FREE_ROOM_UPGRADE',
    FREE_BOARD_UPGRADE = 'FREE_BOARD_UPGRADE',
    KIDS_GO_FREE = 'KIDS_GO_FREE'
}

export enum CancellationPenaltyType {
    NIGHTS = 'NIGHTS',
    PERCENTAGE = 'PERCENTAGE',
    FIXED_AMOUNT = 'FIXED_AMOUNT',
}

