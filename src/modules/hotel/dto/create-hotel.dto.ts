import { IsNotEmpty, IsString, IsOptional, Length, IsArray, ValidateNested, IsNumber, Min, Max, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

export class HotelEmailDto {
    @IsString()
    @IsNotEmpty()
    label: string;

    @IsEmail()
    address: string;
}

export class CreateHotelDto {
    // ── Identité de base ─────────────────────────────────────────────
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsOptional()
    @IsString()
    reference?: string;

    @IsOptional()
    @IsString()
    logoUrl?: string;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(5)
    stars?: number;

    // ── Contact & Localisation ───────────────────────────────────────
    @IsString()
    @IsNotEmpty()
    address: string;

    @IsString()
    @IsNotEmpty()
    phone: string;

    @IsOptional()
    @IsString()
    fax?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => HotelEmailDto)
    emails?: HotelEmailDto[];

    // ── Légal ────────────────────────────────────────────────────────
    @IsString()
    @IsNotEmpty()
    legalRepresentative: string;

    @IsOptional()
    @IsString()
    fiscalName?: string;

    @IsOptional()
    @IsString()
    vatNumber?: string;

    // ── Bancaire ─────────────────────────────────────────────────────
    @IsOptional()
    @IsString()
    bankName?: string;

    @IsOptional()
    @IsString()
    accountNumber?: string;

    @IsOptional()
    @IsString()
    swiftCode?: string;

    @IsOptional()
    @IsString()
    ibanCode?: string;

    // ── Opérationnel ─────────────────────────────────────────────────
    @IsString()
    @Length(3, 3, { message: 'Currency must be a 3-letter ISO code (e.g. TND, EUR, USD)' })
    defaultCurrency: string;
}
