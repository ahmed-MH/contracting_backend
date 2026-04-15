import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { ExchangeRateSource } from '../entities/exchange-rate.entity';

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

    @IsOptional()
    @IsEnum(ExchangeRateSource)
    source?: ExchangeRateSource;

}

export class UpdateExchangeRateDto extends PartialType(CreateExchangeRateDto) {}
