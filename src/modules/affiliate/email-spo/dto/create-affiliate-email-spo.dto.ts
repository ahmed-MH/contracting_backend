import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import {
    AffiliateEmailSpoApplicationStep,
    AffiliateEmailSpoStackMode,
    AffiliateEmailSpoStatus,
} from '../../../../common/constants/enums';

export class CreateAffiliateEmailSpoDto {
    @IsString()
    @Transform(({ value }: { value: string }) => value?.trim())
    name: string;

    @IsString()
    @IsOptional()
    @Transform(({ value }: { value: string }) => value?.trim())
    description?: string;

    @Type(() => Number)
    @IsNumber()
    @Min(0.01)
    @Max(100)
    discountPercent: number;

    @IsDateString()
    applicationFrom: string;

    @IsDateString()
    applicationTo: string;

    @IsEnum(AffiliateEmailSpoStackMode)
    @IsOptional()
    stackMode?: AffiliateEmailSpoStackMode;

    @IsEnum(AffiliateEmailSpoApplicationStep)
    @IsOptional()
    applicationStep?: AffiliateEmailSpoApplicationStep;

    @IsEnum(AffiliateEmailSpoStatus)
    @IsOptional()
    status?: AffiliateEmailSpoStatus;
}
