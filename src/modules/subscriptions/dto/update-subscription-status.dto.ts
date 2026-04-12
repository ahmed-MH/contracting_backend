import { IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateSubscriptionStatusDto {
    @IsString()
    @IsIn(['ACTIVE', 'PAST_DUE', 'SUSPENDED'])
    status: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    reason?: string;

    @IsOptional()
    @IsISO8601()
    renewalDate?: string;
}
