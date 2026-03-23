import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ReductionCalculationType, PaxType, PricingModifierApplicationType, ReductionSystemCode } from '../../../../common/constants/enums';

export class CreateTemplateReductionDto {
    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEnum(ReductionSystemCode)
    systemCode: ReductionSystemCode;

    @IsEnum(ReductionCalculationType)
    calculationType: ReductionCalculationType;

    @IsNumber()
    @IsOptional()
    @Min(0)
    value?: number;

    @IsEnum(PaxType)
    paxType: PaxType;

    @IsInt()
    @Min(1)
    @IsOptional()
    paxOrder?: number | null;

    @IsInt()
    @Min(0)
    minAge: number;

    @IsInt()
    @Max(99)
    maxAge: number;

    @IsEnum(PricingModifierApplicationType)
    @IsOptional()
    applicationType?: PricingModifierApplicationType;
}

