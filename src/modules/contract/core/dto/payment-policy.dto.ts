import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Length,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';
import { ContractMarketScope, PaymentConditionType, PaymentMethodType } from '../../../../common/constants/enums';

export enum PaymentDepositType {
    AMOUNT = 'AMOUNT',
    PERCENTAGE = 'PERCENTAGE',
}

export enum PaymentDueTrigger {
    BOOKING_CONFIRMATION = 'BOOKING_CONFIRMATION',
    BEFORE_CHECK_IN = 'BEFORE_CHECK_IN',
    INVOICE_ISSUE = 'INVOICE_ISSUE',
    CUSTOM = 'CUSTOM',
}

export enum PaymentConditionBasis {
    INVOICE_ISSUE = 'INVOICE_ISSUE',
    INVOICE_RECEIPT = 'INVOICE_RECEIPT',
    CHECK_OUT = 'CHECK_OUT',
}

export class ContractPaymentMethodDto {
    @IsEnum(PaymentMethodType)
    type: PaymentMethodType;

    @IsBoolean()
    @IsOptional()
    isPrimary?: boolean;
}

export class ContractPaymentConditionDto {
    @IsEnum(PaymentConditionType)
    type: PaymentConditionType;

    @IsNumber()
    @Min(0)
    @Max(100)
    @IsOptional()
    percentage?: number;

    @IsInt()
    @Min(0)
    @IsOptional()
    days?: number;

    @IsEnum(PaymentConditionBasis)
    @IsOptional()
    basis?: PaymentConditionBasis;

    @IsString()
    @IsOptional()
    label?: string;

    @IsString()
    @IsOptional()
    notes?: string;
}

export class ContractPaymentDepositDto {
    @IsEnum(PaymentDepositType)
    type: PaymentDepositType;

    @IsNumber()
    @Min(0)
    value: number;

    @IsString()
    @Length(3, 3)
    @IsOptional()
    currency?: string;

    @IsEnum(PaymentDueTrigger)
    @IsOptional()
    dueTrigger?: PaymentDueTrigger;

    @IsInt()
    @Min(0)
    @IsOptional()
    dueDays?: number;

    @IsBoolean()
    @IsOptional()
    refundable?: boolean;
}

export class ContractPaymentPolicyDto {
    @IsEnum(ContractMarketScope)
    @IsOptional()
    marketScope?: ContractMarketScope;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ContractPaymentMethodDto)
    @IsOptional()
    methods?: ContractPaymentMethodDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ContractPaymentConditionDto)
    @IsOptional()
    conditions?: ContractPaymentConditionDto[];

    @ValidateNested()
    @Type(() => ContractPaymentDepositDto)
    @IsOptional()
    deposit?: ContractPaymentDepositDto | null;

    @IsInt()
    @Min(1)
    @IsOptional()
    selectedHotelBankAccountId?: number | null;

    @IsString()
    @IsOptional()
    notes?: string | null;
}
