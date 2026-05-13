import { IsInt, Min } from 'class-validator';

export class CreateCheckoutSessionDto {
    @IsInt()
    @Min(1)
    tenantId: number;

    @IsInt()
    @Min(1)
    planId: number;
}
