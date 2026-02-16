import { IsInt, IsNumber, Min } from 'class-validator';

export class SetPriceDto {
    @IsInt()
    contractLineId: number;

    @IsInt()
    arrangementId: number;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    amount: number;
}
