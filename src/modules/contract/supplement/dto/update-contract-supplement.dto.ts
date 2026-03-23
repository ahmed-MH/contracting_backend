import {
    IsString,
    IsNotEmpty,
    IsEnum,
    IsNumber,
    IsOptional,
    IsBoolean,
    IsArray,
    IsInt,
    ValidateNested,
    IsDateString,
    Min,
    Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    SupplementCalculationType,
    PricingModifierApplicationType,
    SupplementSystemCode,
} from '../../../../common/constants/enums';

export class PeriodOverrideDto {
    @IsInt()
    periodId: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    overrideValue?: number | null;
}

export class UpdateContractSupplementDto {
    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsNotEmpty()
    @IsOptional()
    name?: string;

    @IsEnum(SupplementSystemCode)
    @IsOptional()
    systemCode?: SupplementSystemCode;

    @IsEnum(SupplementCalculationType)
    @IsOptional()
    type?: SupplementCalculationType;

    @IsNumber()
    @IsOptional()
    @Min(0)
    value?: number;

    @IsString()
    @IsOptional()
    formula?: string;

    @IsBoolean()
    @IsOptional()
    isMandatory?: boolean;

    @IsEnum(PricingModifierApplicationType)
    @IsOptional()
    applicationType?: PricingModifierApplicationType;

    @IsInt()
    @Min(0)
    @IsOptional()
    minAge?: number | null;

    @IsInt()
    @Max(99)
    @IsOptional()
    maxAge?: number | null;

    @IsArray()
    @IsInt({ each: true })
    @IsOptional()
    applicableContractRoomIds?: number[];

    /** New: supports full period targeting with optional seasonal override */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PeriodOverrideDto)
    @IsOptional()
    applicablePeriods?: PeriodOverrideDto[];

    /**
     * @deprecated Use applicablePeriods[] instead.
     * Kept for backward compatibility with old edit modal.
     */
    @IsArray()
    @IsInt({ each: true })
    @IsOptional()
    applicablePeriodIds?: number[];

    /** Update the specific event date for this supplement instance. */
    @IsDateString()
    @IsOptional()
    specificDate?: string | null;
}
