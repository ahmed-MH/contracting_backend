import {
    IsString,
    IsNotEmpty,
    IsEnum,
    IsNumber,
    IsOptional,
    IsArray,
    IsInt,
    Min,
    Max,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReductionCalculationType, PaxType, PricingModifierApplicationType, ReductionSystemCode } from '../../../../common/constants/enums';

class ApplicablePeriodOverrideDto {
    @IsInt()
    periodId: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    overrideValue?: number;
}

export class UpdateContractReductionDto {
    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsNotEmpty()
    @IsOptional()
    name?: string;

    @IsEnum(ReductionSystemCode)
    @IsOptional()
    systemCode?: ReductionSystemCode;

    @IsEnum(ReductionCalculationType)
    @IsOptional()
    calculationType?: ReductionCalculationType;

    @IsNumber()
    @IsOptional()
    @Min(0)
    value?: number;

    @IsEnum(PaxType)
    @IsOptional()
    paxType?: PaxType;

    @IsInt()
    @Min(1)
    @IsOptional()
    paxOrder?: number | null;

    @IsInt()
    @Min(0)
    @IsOptional()
    minAge?: number;

    @IsInt()
    @Max(99)
    @IsOptional()
    maxAge?: number;

    @IsArray()
    @IsInt({ each: true })
    @IsOptional()
    applicableContractRoomIds?: number[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ApplicablePeriodOverrideDto)
    @IsOptional()
    applicablePeriods?: ApplicablePeriodOverrideDto[];

    @IsEnum(PricingModifierApplicationType)
    @IsOptional()
    applicationType?: PricingModifierApplicationType;
}

