import { IsNotEmpty, IsString, IsOptional, Length } from 'class-validator';

export class CreateHotelDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsOptional()
    logoUrl?: string;

    @IsString()
    @IsNotEmpty()
    address: string;

    @IsString()
    @IsNotEmpty()
    phone: string;

    @IsString()
    @IsNotEmpty()
    legalRepresentative: string;

    @IsString()
    @IsNotEmpty()
    bankDetails: string;

    @IsString()
    @Length(3, 3, { message: 'Currency must be a 3-letter ISO code (e.g. TND, EUR, USD)' })
    defaultCurrency: string;
}
