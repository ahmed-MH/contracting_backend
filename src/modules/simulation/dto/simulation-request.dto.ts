import { IsNumber, IsString, IsNotEmpty, IsDateString, IsOptional, ValidateNested, Min, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

class OccupantsDto {
    @IsNumber()
    @Min(1)
    adults: number;

    @IsArray()
    @IsNumber({}, { each: true })
    childrenAges: number[];
}

export class SimulationRequestDto {
    @IsNumber()
    @IsNotEmpty()
    contractId: number;

    @IsNumber()
    @IsNotEmpty()
    roomId: number;

    @IsNumber()
    @IsNotEmpty()
    boardTypeId: number;

    @IsDateString()
    @IsNotEmpty()
    checkIn: string;

    @IsDateString()
    @IsNotEmpty()
    checkOut: string;

    @IsDateString()
    @IsOptional()
    bookingDate?: string;

    @ValidateNested()
    @Type(() => OccupantsDto)
    @IsNotEmpty()
    occupants: OccupantsDto;
}
