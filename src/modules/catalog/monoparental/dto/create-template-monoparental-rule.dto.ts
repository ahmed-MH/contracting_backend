import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, IsInt, Min } from 'class-validator';
import { BaseRateType, ChildSurchargeBase } from '../../../../common/constants/enums';

export class CreateTemplateMonoparentalRuleDto {
    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    // Zone A: Condition
    @IsInt()
    @Min(1)
    adultCount: number;

    @IsInt()
    @Min(1)
    childCount: number;

    @IsNumber()
    @Min(0)
    minAge: number;

    @IsNumber()
    maxAge: number;

    // Zone B: Pricing
    @IsEnum(BaseRateType)
    baseRateType: BaseRateType;

    @IsNumber()
    @Min(0)
    childSurchargePercentage: number;

    @IsEnum(ChildSurchargeBase)
    childSurchargeBase: ChildSurchargeBase;
}
