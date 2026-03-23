import {
    IsString,
    IsNotEmpty,
    IsEnum,
    IsNumber,
    IsOptional,
    IsBoolean,
    IsDateString,
    IsInt,
    Min,
    Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
    SupplementCalculationType,
    PricingModifierApplicationType,
    SupplementSystemCode,
} from '../../../../common/constants/enums';

export class CreateTemplateSupplementDto {
    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsNotEmpty()
    @Transform(({ value }: { value: string }) => value.trim())
    name: string;

    @IsEnum(SupplementSystemCode)
    @IsOptional()
    systemCode?: SupplementSystemCode;

    @IsEnum(SupplementCalculationType)
    type: SupplementCalculationType;

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
    applicationType: PricingModifierApplicationType;

    @IsInt()
    @Min(0)
    @IsOptional()
    minAge?: number | null;

    @IsInt()
    @Max(99)
    @IsOptional()
    maxAge?: number | null;

    /** Optional event date, YYYY-MM-DD. Only contracts covering this date can import this template. */
    @IsDateString()
    @IsOptional()
    specificDate?: string | null;
}
