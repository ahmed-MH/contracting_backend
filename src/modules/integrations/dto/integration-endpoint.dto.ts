import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { IntegrationEndpointStatus } from '../../../common/constants/enums';

export class UpdateIntegrationEndpointDto {
    @IsOptional()
    @IsEnum(IntegrationEndpointStatus)
    status?: IntegrationEndpointStatus;

    @IsOptional()
    @IsBoolean()
    requiresApiKey?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    rateLimitPerMinute?: number;
}
