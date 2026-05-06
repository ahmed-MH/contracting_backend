import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { IntegrationApiKeyEnvironment } from '../../../common/constants/enums';

export class CreateIntegrationApiKeyDto {
    @Type(() => Number)
    @IsInt()
    apiUserId: number;

    @IsString()
    @MaxLength(255)
    name: string;

    @IsOptional()
    @IsDateString()
    expiresAt?: string | null;

    @IsOptional()
    @IsEnum(IntegrationApiKeyEnvironment)
    environment?: IntegrationApiKeyEnvironment;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    allowedIps?: string[];
}

export class UpdateIntegrationApiKeyDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    name?: string;

    @IsOptional()
    @IsDateString()
    expiresAt?: string | null;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    allowedIps?: string[];
}

export class RotateIntegrationApiKeyDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    name?: string;

    @IsOptional()
    @IsDateString()
    expiresAt?: string | null;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    allowedIps?: string[];
}
