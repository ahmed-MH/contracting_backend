import {
    IsNumber,
    IsNotEmpty,
    IsString,
    IsOptional,
    IsDateString,
    IsObject,
    IsBoolean,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProformaDto {
    @IsNumber()
    @IsNotEmpty()
    affiliateId: number;

    @IsNumber()
    @IsNotEmpty()
    contractId: number;

    @IsString()
    @IsNotEmpty()
    customerName: string;

    @IsString()
    @IsOptional()
    customerEmail?: string;

    @IsDateString()
    @IsNotEmpty()
    checkIn: string;

    @IsDateString()
    @IsNotEmpty()
    checkOut: string;

    @IsDateString()
    @IsNotEmpty()
    bookingDate: string;

    @IsString()
    @IsOptional()
    voucherNumber?: string;

    @IsString()
    @IsNotEmpty()
    boardTypeName: string;

    @IsString()
    @IsNotEmpty()
    currency: string;

    @IsBoolean()
    @IsOptional()
    taxEnabled?: boolean;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @IsOptional()
    taxAmount?: number;

    @IsString()
    @IsOptional()
    taxName?: string;

    @IsNotEmpty()
    roomingSummary: any;

    @IsNotEmpty()
    simulationInput: any;

    @IsNotEmpty()
    calculationResult: any;

    @IsObject()
    @IsNotEmpty()
    totals: any;

    @IsString()
    @IsOptional()
    notes?: string;
}
