import { IsString, IsOptional, IsEnum, IsArray, IsInt } from 'class-validator';
import { UserRole } from '../../../common/constants/enums';

export class UpdateUserDto {
    @IsString()
    @IsOptional()
    firstName?: string;

    @IsString()
    @IsOptional()
    lastName?: string;

    @IsEnum(UserRole)
    @IsOptional()
    role?: UserRole;

    @IsArray()
    @IsInt({ each: true })
    @IsOptional()
    hotelIds?: number[];
}
