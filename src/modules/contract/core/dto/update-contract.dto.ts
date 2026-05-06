import { IsString, IsOptional, IsDateString, IsArray, IsInt, Length, IsEnum, IsNumber, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentConditionType, PaymentMethodType } from '../../../../common/constants/enums';
import { ContractPaymentPolicyDto } from './payment-policy.dto';

export class UpdateContractDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date string' })
    @IsOptional()
    startDate?: string;

    @IsDateString({}, { message: 'endDate must be a valid ISO 8601 date string' })
    @IsOptional()
    endDate?: string;

    @IsString()
    @Length(3, 3)
    @IsOptional()
    currency?: string;

    @IsArray()
    @IsInt({ each: true })
    @IsOptional()
    affiliateIds?: number[];

    @IsString()
    @IsOptional()
    status?: string;

    @IsEnum(PaymentConditionType)
    @IsOptional()
    paymentCondition?: PaymentConditionType;

    @IsNumber()
    @Min(0)
    @IsOptional()
    depositAmount?: number;

    @IsInt()
    @Min(0)
    @IsOptional()
    creditDays?: number;

    @IsArray()
    @IsEnum(PaymentMethodType, { each: true })
    @IsOptional()
    paymentMethods?: PaymentMethodType[];

    @ValidateNested()
    @Type(() => ContractPaymentPolicyDto)
    @IsOptional()
    paymentPolicy?: ContractPaymentPolicyDto | null;

    @IsInt()
    @Min(1)
    @IsOptional()
    selectedHotelBankAccountId?: number | null;

    @ValidateIf((o: any) => o.baseArrangementId !== null)
    @IsInt()
    @IsOptional()
    baseArrangementId?: number | null;
}
