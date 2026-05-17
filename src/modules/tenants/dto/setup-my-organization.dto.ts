import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetupMyOrganizationDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    organizationName: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    phone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    address?: string;
}
