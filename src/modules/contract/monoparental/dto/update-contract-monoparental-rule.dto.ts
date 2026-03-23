import {
    IsString,
    IsNotEmpty,
    IsEnum,
    IsNumber,
    IsOptional,
    IsArray,
    IsInt,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BaseRateType, ChildSurchargeBase } from '../../../../common/constants/enums';

class ApplicablePeriodOverrideDto {
    @IsInt()
    periodId: number;

    @IsEnum(BaseRateType)
    @IsOptional()
    overrideBaseRateType?: BaseRateType;

    @IsEnum(ChildSurchargeBase)
    @IsOptional()
    overrideChildSurchargeBase?: ChildSurchargeBase;

    @IsNumber()
    @Min(0)
    @IsOptional()
    overrideChildSurchargeValue?: number;
}

export class UpdateContractMonoparentalRuleDto {
    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsNotEmpty()
    @IsOptional()
    name?: string;

    // Zone A
    @IsInt()
    @Min(1)
    @IsOptional()
    adultCount?: number;

    @IsInt()
    @Min(1)
    @IsOptional()
    childCount?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    minAge?: number;

    @IsNumber()
    @IsOptional()
    maxAge?: number;

    // Zone B
    @IsEnum(BaseRateType)
    @IsOptional()
    baseRateType?: BaseRateType;

    @IsNumber()
    @Min(0)
    @IsOptional()
    childSurchargePercentage?: number;

    @IsEnum(ChildSurchargeBase)
    @IsOptional()
    childSurchargeBase?: ChildSurchargeBase;

    // Targeting
    @IsArray()
    @IsInt({ each: true })
    @IsOptional()
    applicableContractRoomIds?: number[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ApplicablePeriodOverrideDto)
    @IsOptional()
    applicablePeriods?: ApplicablePeriodOverrideDto[];
}
