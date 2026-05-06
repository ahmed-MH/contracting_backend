import { Type } from 'class-transformer';
import {
    ArrayUnique,
    IsArray,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import {
    IntegrationApiUserStatus,
    IntegrationPermission,
} from '../../../common/constants/enums';

export class CreateIntegrationApiUserDto {
    @IsString()
    @MaxLength(255)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    @IsOptional()
    @IsEnum(IntegrationApiUserStatus)
    status?: IntegrationApiUserStatus;

    @IsArray()
    @ArrayUnique()
    @IsEnum(IntegrationPermission, { each: true })
    permissions: IntegrationPermission[];

    @IsArray()
    @ArrayUnique()
    @Type(() => Number)
    @IsInt({ each: true })
    allowedHotelIds: number[];
}

export class UpdateIntegrationApiUserDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    @IsOptional()
    @IsEnum(IntegrationApiUserStatus)
    status?: IntegrationApiUserStatus;

    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @IsEnum(IntegrationPermission, { each: true })
    permissions?: IntegrationPermission[];

    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @Type(() => Number)
    @IsInt({ each: true })
    allowedHotelIds?: number[];
}
