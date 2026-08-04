import { Transform } from 'class-transformer';
import { IsDateString, IsNumber, IsString, Length, Min } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

const upperCurrency = ({ value }: { value: unknown }) => String(value ?? '').trim().toUpperCase();

export class CreateExchangeRateDto {
    @Transform(upperCurrency)
    @IsString()
    @Length(3, 3)
    fromCurrency: string;

    @Transform(upperCurrency)
    @IsString()
    @Length(3, 3)
    toCurrency: string;

    @IsNumber()
    @Min(0.000001)
    rate: number;

    @IsDateString()
    effectiveDate: string;
}

export class UpdateExchangeRateDto extends PartialType(CreateExchangeRateDto) {}
