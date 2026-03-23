import { IsString, IsNotEmpty, IsDateString, IsArray, IsInt, Length, IsOptional, IsEnum, IsNumber, Min, ValidateIf } from 'class-validator';
import { PaymentConditionType, PaymentMethodType } from '../../../../common/constants/enums';

export class CreateContractDto {
    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date string' })
    startDate: string;

    @IsDateString({}, { message: 'endDate must be a valid ISO 8601 date string' })
    endDate: string;

    @IsString()
    @Length(3, 3, { message: 'Currency must be a 3-letter ISO code (e.g. TND, EUR)' })
    currency: string;

    @IsArray()
    @IsInt({ each: true })
    affiliateIds: number[];

    // ─── Payment Policy ──────────────────────────────────────────

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

    @ValidateIf((o: any) => o.baseArrangementId !== null)
    @IsInt()
    @IsOptional()
    baseArrangementId?: number | null;
}
