import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PlanBillingType } from '../../../common/constants/enums';

export class CreatePlanDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    description: string;

    @IsNumber()
    @Min(0)
    monthlyPrice: number;

    @IsOptional()
    @IsEnum(PlanBillingType)
    billingType?: PlanBillingType;

    @IsString()
    @IsNotEmpty()
    currency: string;

    @IsInt()
    @Min(1)
    maxHotels: number;

    @IsInt()
    @Min(1)
    maxUsers: number;

    @IsBoolean()
    apiAccess: boolean;

    @IsString()
    @IsNotEmpty()
    supportTier: string;

    @IsArray()
    @IsString({ each: true })
    features: string[];

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsString()
    stripeProductId?: string;

    @IsOptional()
    @IsString()
    stripePriceId?: string;
}
