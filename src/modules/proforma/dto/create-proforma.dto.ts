import {
    IsNumber,
    IsNotEmpty,
    IsString,
    IsOptional,
    IsDateString,
    IsObject,
} from 'class-validator';

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
    @IsNotEmpty()
    boardTypeName: string;

    @IsString()
    @IsNotEmpty()
    currency: string;

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
