import {
    IsBoolean,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProformaPreviewSettingsDto {
    @IsString()
    @IsOptional()
    currency?: string;

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

    @IsString()
    @IsOptional()
    notes?: string;

    @IsString()
    @IsOptional()
    voucherNumber?: string;
}
