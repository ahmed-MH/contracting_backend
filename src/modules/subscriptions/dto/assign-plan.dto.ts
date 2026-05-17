import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { SubscriptionStatus } from '../../../common/constants/enums';

export class AssignPlanDto {
    @IsInt()
    @Min(1)
    tenantId: number;

    @IsInt()
    @Min(1)
    planId: number;

    @IsOptional()
    @IsEnum(SubscriptionStatus)
    status?: SubscriptionStatus;
}
