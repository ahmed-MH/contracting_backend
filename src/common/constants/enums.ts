export enum UserRole {
    SUPERVISOR = 'SUPERVISOR',
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

export enum RoomInventoryType {
    STANDARD = 'STANDARD',
    PROMO = 'PROMO',
}

export enum PaymentConditionType {
    FULL_PREPAYMENT = 'FULL_PREPAYMENT',
    PARTIAL_DEPOSIT = 'PARTIAL_DEPOSIT',
    CREDIT_DAYS_FROM_INVOICE = 'CREDIT_DAYS_FROM_INVOICE',
    PAYMENT_ON_ARRIVAL = 'PAYMENT_ON_ARRIVAL',
    PAYMENT_ON_DEPARTURE = 'PAYMENT_ON_DEPARTURE',
    CUSTOM = 'CUSTOM',
    // Legacy value accepted for backward compatibility. New writes use FULL_PREPAYMENT.
    PREPAYMENT_100 = 'PREPAYMENT_100',
    DEPOSIT = 'DEPOSIT',
}

export enum PaymentMethodType {
    BANK_TRANSFER = 'BANK_TRANSFER',
    SWIFT_TRANSFER = 'SWIFT_TRANSFER',
    BANK_CHECK = 'BANK_CHECK',
    BANK_DRAFT = 'BANK_DRAFT',
    CASH = 'CASH',
    CREDIT_CARD = 'CREDIT_CARD',
    PAYMENT_GATEWAY = 'PAYMENT_GATEWAY',
    OTHER = 'OTHER',
}

export enum ContractMarketScope {
    INTERNATIONAL = 'INTERNATIONAL',
    NATIONAL = 'NATIONAL',
    MIXED = 'MIXED',
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
    AGE = 'AGE',
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

export enum AffiliateEmailSpoStackMode {
    ROLLING = 'ROLLING',
    CUMULATIVE = 'CUMULATIVE',
}

export enum AffiliateEmailSpoApplicationStep {
    AFTER_BASE_RATE = 'AFTER_BASE_RATE',
    AFTER_BOARD_SUPPLEMENT = 'AFTER_BOARD_SUPPLEMENT',
    AFTER_SUPPLEMENT = 'AFTER_SUPPLEMENT',
    AFTER_REDUCTION = 'AFTER_REDUCTION',
    AFTER_MONOPARENTAL = 'AFTER_MONOPARENTAL',
    AFTER_EARLY_BOOKING = 'AFTER_EARLY_BOOKING',
    AFTER_CONTRACT_SPO = 'AFTER_CONTRACT_SPO',
}

export enum AffiliateEmailSpoStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

export enum CancellationPenaltyType {
    NIGHTS = 'NIGHTS',
    PERCENTAGE = 'PERCENTAGE',
    FIXED_AMOUNT = 'FIXED_AMOUNT',
}

export enum IntegrationApiUserStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

export enum IntegrationApiKeyStatus {
    ACTIVE = 'ACTIVE',
    REVOKED = 'REVOKED',
    EXPIRED = 'EXPIRED',
}

export enum IntegrationApiKeyEnvironment {
    TEST = 'TEST',
    PRODUCTION = 'PRODUCTION',
}

export enum IntegrationEndpointStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

export enum IntegrationPermission {
    RESERVATIONS_QUOTE = 'RESERVATIONS_QUOTE',
}

export enum IntegrationUsageLogSource {
    PUBLIC_API = 'PUBLIC_API',
    PLAYGROUND = 'PLAYGROUND',
}

export enum IntegrationAlertSeverity {
    INFO = 'INFO',
    WARNING = 'WARNING',
    CRITICAL = 'CRITICAL',
}

export enum SubscriptionStatus {
    ACTIVE = 'ACTIVE',
    PAST_DUE = 'PAST_DUE',
    SUSPENDED = 'SUSPENDED',
}

export enum PublicSignupStatus {
    PENDING_PAYMENT = 'PENDING_PAYMENT',
    PAID = 'PAID',
    COMPLETED = 'COMPLETED',
    EXPIRED = 'EXPIRED',
    FAILED = 'FAILED',
}

export enum PlanBillingType {
    RECURRING = 'RECURRING',
    ONE_TIME = 'ONE_TIME',
}

// ─── Proforma Invoice ────────────────────────────────────────────────

export enum ProformaInvoiceStatus {
    DRAFT = 'DRAFT',
    ISSUED = 'ISSUED',
    GENERATED = 'GENERATED',
    CANCELLED = 'CANCELLED',
}

