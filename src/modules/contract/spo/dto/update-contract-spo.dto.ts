import { PartialType } from '@nestjs/mapped-types';
import { CreateContractSpoDto } from './create-contract-spo.dto';

import { IsOptional, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SpoPeriodOverrideDto {
    @IsNumber()
    periodId: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    overrideValue?: number;
}

export class UpdateContractSpoDto extends PartialType(CreateContractSpoDto) {
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SpoPeriodOverrideDto)
    applicablePeriods?: SpoPeriodOverrideDto[];
}
