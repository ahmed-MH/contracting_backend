import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class IntegrationUsageLogQueryDto {
    @IsOptional()
    @IsString()
    endpointCode?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    apiUserId?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    hotelId?: number;

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    success?: boolean;

    @IsOptional()
    @IsDateString()
    dateFrom?: string;

    @IsOptional()
    @IsDateString()
    dateTo?: string;
}
