import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCurrentUserDto {
    @IsString()
    @MaxLength(100)
    @IsOptional()
    firstName?: string;

    @IsString()
    @MaxLength(100)
    @IsOptional()
    lastName?: string;
}
