import { IsString, IsNumber, IsEnum, IsBoolean, IsOptional, Min, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CancellationPenaltyType } from '../../../../common/constants/enums';

class CancellationPeriodOverrideDto {
    @IsNumber()
    periodId: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    overrideValue?: number;
}

export class CreateContractCancellationRuleDto {
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

    @IsArray()
    @IsOptional()
    periodIds?: number[];

    @IsArray()
    contractRoomIds: number[];
}

export class UpdateContractCancellationRuleDto {
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

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => CancellationPeriodOverrideDto)
    applicablePeriods?: CancellationPeriodOverrideDto[];

    @IsArray()
    @IsOptional()
    contractRoomIds?: number[];
}

export class ImportCancellationRuleDto {
    @IsNumber()
    templateId: number;
}
