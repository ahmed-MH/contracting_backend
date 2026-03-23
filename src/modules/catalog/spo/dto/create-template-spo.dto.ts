import { IsString, IsEnum, IsNumber, IsOptional, IsInt, Min } from 'class-validator';
import { SpoConditionType, SpoBenefitType, PricingModifierApplicationType } from '../../../../common/constants/enums';
import { Type } from 'class-transformer';

export class CreateTemplateSpoDto {
    @IsString()
    name: string;

    @IsEnum(SpoConditionType)
    conditionType: SpoConditionType;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    conditionValue?: number;

    @IsEnum(SpoBenefitType)
    benefitType: SpoBenefitType;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    benefitValue?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    value?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Type(() => Number)
    stayNights?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Type(() => Number)
    payNights?: number;

    @IsEnum(PricingModifierApplicationType)
    @IsOptional()
    applicationType?: PricingModifierApplicationType;
}
