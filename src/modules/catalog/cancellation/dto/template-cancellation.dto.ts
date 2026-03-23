import { IsString, IsNumber, IsEnum, IsBoolean, IsOptional, Min } from 'class-validator';
import { CancellationPenaltyType } from '../../../../common/constants/enums';

export class CreateTemplateCancellationRuleDto {
    @IsString()
    name: string;

    @IsNumber()
    @Min(0)
    daysBeforeArrival: number;

    @IsBoolean()
    appliesToNoShow: boolean;

    @IsNumber()
    @IsOptional()
    @Min(0)
    minStayCondition?: number;

    @IsEnum(CancellationPenaltyType)
    penaltyType: CancellationPenaltyType;

    @IsNumber()
    @Min(0)
    baseValue: number;
}

export class UpdateTemplateCancellationRuleDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsNumber()
    @IsOptional()
    @Min(0)
    daysBeforeArrival?: number;

    @IsBoolean()
    @IsOptional()
    appliesToNoShow?: boolean;

    @IsNumber()
    @IsOptional()
    @Min(0)
    minStayCondition?: number;

    @IsEnum(CancellationPenaltyType)
    @IsOptional()
    penaltyType?: CancellationPenaltyType;

    @IsNumber()
    @IsOptional()
    @Min(0)
    baseValue?: number;
}
