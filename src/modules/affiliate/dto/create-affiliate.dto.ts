import { Transform, Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { AffiliateType } from '../../../common/constants/enums';

class AffiliateEmailDto {
    @IsString()
    @IsNotEmpty()
    label: string;

    @IsEmail()
    address: string;
}

export class CreateAffiliateDto {
    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsNotEmpty()
    @Transform(({ value }: { value: string }) => value.trim())
    companyName: string;

    @IsEnum(AffiliateType)
    affiliateType: AffiliateType;

    @IsString()
    @IsOptional()
    @Transform(({ value }: { value: string }) => value?.trim())
    representativeName?: string;

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => AffiliateEmailDto)
    emails?: AffiliateEmailDto[];

    @IsString()
    @IsOptional()
    bankName?: string;

    @IsString()
    @IsOptional()
    iban?: string;

    @IsString()
    @IsOptional()
    swift?: string;

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

}
