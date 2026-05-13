import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreatePublicOnboardingCheckoutSessionDto {
    @IsInt()
    @Min(1)
    planId: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    companyName: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    adminFullName: string;

    @IsEmail()
    @MaxLength(255)
    adminEmail: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    phone?: string;
}
