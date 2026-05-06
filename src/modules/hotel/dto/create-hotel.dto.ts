import { IsBoolean, IsInt, IsNotEmpty, IsString, IsOptional, Length, IsArray, ValidateNested, IsNumber, Min, Max, IsEmail, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export class HotelEmailDto {
    @IsString()
    @IsNotEmpty()
    label: string;

    @IsEmail()
    address: string;
}

export class HotelBankAccountDto {
    @IsOptional()
    @IsInt()
    id?: number;

    @IsString()
    @IsNotEmpty()
    label: string;

    @IsOptional()
    @IsString()
    bankName?: string;

    @IsOptional()
    @IsString()
    accountNumber?: string;

    @IsOptional()
    @IsString()
    rib?: string;

    @IsOptional()
    @IsString()
    iban?: string;

    @IsOptional()
    @IsString()
    swiftCode?: string;

    @IsOptional()
    @IsString()
    @Length(3, 3, { message: 'Currency must be a 3-letter ISO code (e.g. TND, EUR, USD)' })
    currency?: string;

    @IsOptional()
    @IsString()
    @Length(2, 2, { message: 'Country must be a 2-letter ISO code (e.g. TN, FR)' })
    country?: string;

    @IsOptional()
    @IsBoolean()
    isDefault?: boolean;

    @IsOptional()
    @IsBoolean()
    active?: boolean;
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
    @IsString()
    @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'preferredThemeColor must be a hex color like #0D9488' })
    preferredThemeColor?: string;

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

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => HotelBankAccountDto)
    bankAccounts?: HotelBankAccountDto[];

    // ── Opérationnel ─────────────────────────────────────────────────
    @IsString()
    @Length(3, 3, { message: 'Currency must be a 3-letter ISO code (e.g. TND, EUR, USD)' })
    defaultCurrency: string;
}
