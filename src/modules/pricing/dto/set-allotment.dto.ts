import { IsInt, IsBoolean, IsOptional, Min } from 'class-validator';

export class SetAllotmentDto {
    @IsInt()
    contractLineId: number;

    @IsInt()
    @Min(0)
    quantity: number;

    @IsBoolean()
    @IsOptional()
    isStopSale?: boolean;
}
