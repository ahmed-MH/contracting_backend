import { IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SubscriptionStatus } from '../../../common/constants/enums';

export class UpdateSubscriptionStatusDto {
    @IsString()
    @IsIn(Object.values(SubscriptionStatus))
    status: SubscriptionStatus;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    reason?: string;

    @IsOptional()
    @IsISO8601()
    renewalDate?: string;
}
