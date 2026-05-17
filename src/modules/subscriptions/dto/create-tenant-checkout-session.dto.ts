import { IsInt, Min } from 'class-validator';

export class CreateTenantCheckoutSessionDto {
    @IsInt()
    @Min(1)
    planId: number;
}
