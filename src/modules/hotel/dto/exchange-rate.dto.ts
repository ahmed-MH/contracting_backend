import { IsString, IsNumber, IsDateString, IsOptional, Length, Min } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateExchangeRateDto {
    @IsString()
    @Length(3, 3)
    currency: string;

    @IsNumber()
    @Min(0.0001)
    rate: number;

    @IsDateString()
    validFrom: string;

    @IsOptional()
    @IsDateString()
    validUntil?: string;
}

export class UpdateExchangeRateDto extends PartialType(CreateExchangeRateDto) {}
