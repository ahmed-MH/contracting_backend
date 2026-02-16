import {
    IsEmail,
    IsString,
    IsNotEmpty,
    IsEnum,
    IsOptional,
    MinLength,
} from 'class-validator';
import { UserRole } from '../../../shared/constants/enums';

export class CreateUserDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6, { message: 'Password must be at least 6 characters' })
    password: string;

    @IsString()
    @IsNotEmpty()
    firstName: string;

    @IsString()
    @IsNotEmpty()
    lastName: string;

    @IsEnum(UserRole)
    @IsOptional()
    role?: UserRole;
}
