import { IsArray, ValidateNested, IsNumber, IsNotEmpty, IsBoolean, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PriceDto {
    @IsNumber()
    @IsNotEmpty()
    periodId: number;

    @IsNumber()
    @IsNotEmpty()
    contractRoomId: number;

    @IsNumber()
    @IsNotEmpty()
    arrangementId: number;

    @IsNumber()
    @IsNotEmpty()
    @Min(0)
    amount: number;

    @IsNumber()
    @IsNotEmpty()
    @Min(0)
    minStay: number;

    @IsNumber()
    @IsNotEmpty()
    @Min(0)
    releaseDays: number;
}

export class CellDto {
    @IsNumber()
    @IsNotEmpty()
    periodId: number;

    @IsNumber()
    @IsNotEmpty()
    contractRoomId: number;

    @IsBoolean()
    isContracted: boolean;

    @IsNumber()
    @IsOptional()
    @Min(0)
    allotment?: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PriceDto)
    prices: PriceDto[];
}

export class BatchUpsertPricesDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CellDto)
    cells: CellDto[];
}
