import { IsEmail, IsEnum, IsArray, IsOptional, IsInt } from 'class-validator';
import { UserRole } from '../../../common/constants/enums';

export class InviteUserDto {
    @IsEmail()
    email: string;

    @IsEnum(UserRole)
    role: UserRole;

    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    hotelIds?: number[];
}
