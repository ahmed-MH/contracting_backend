import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';

export class IntegrationUsageLogQueryDto extends PageOptionsDto {
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
    @IsIn(['true', 'false'])
    success?: 'true' | 'false';

    @IsOptional()
    @IsDateString()
    dateFrom?: string;

    @IsOptional()
    @IsDateString()
    dateTo?: string;
}
