import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum } from 'class-validator';
import { PaymentType } from '../../../common/constants/enums';

export class CreateAffiliateDto {
    @IsString()
    @IsNotEmpty()
    @Transform(({ value }: { value: string }) => value.trim())
    companyName: string;

    @IsEnum(PaymentType)
    paymentType: PaymentType;

    @IsString()
    @IsOptional()
    @Transform(({ value }: { value: string }) => value?.trim())
    representativeName?: string;

    @IsEmail()
    @IsOptional()
    @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
    representativeEmail?: string;

    @IsString()
    @IsOptional()
    @Transform(({ value }: { value: string }) => value?.trim())
    address?: string;

    @IsString()
    @IsOptional()
    @Transform(({ value }: { value: string }) => value?.trim())
    phone?: string;

    @IsString()
    @IsOptional()
    @Transform(({ value }: { value: string }) => value?.trim())
    fax?: string;

    @IsString()
    @IsOptional()
    @Transform(({ value }: { value: string }) =>
        typeof value === 'string' ? value.trim().toUpperCase() : value,
    )
    market?: string;
}
