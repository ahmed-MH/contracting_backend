import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ListIssuedProformasDto {
    @IsString()
    @IsOptional()
    search?: string;

    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @IsOptional()
    affiliateId?: number;

    @IsDateString()
    @IsOptional()
    issuedFrom?: string;

    @IsDateString()
    @IsOptional()
    issuedTo?: string;
}
