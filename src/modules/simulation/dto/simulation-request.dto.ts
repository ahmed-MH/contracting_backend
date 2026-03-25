import { IsNumber, IsNotEmpty, IsDateString, IsOptional, ValidateNested, IsArray, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum OccupantType {
    ADULT = 'ADULT',
    CHILD = 'CHILD',
    INFANT = 'INFANT'
}

export class OccupantDto {
    @IsNumber()
    @IsNotEmpty()
    @Min(1)
    paxOrder: number;

    @IsEnum(OccupantType)
    @IsNotEmpty()
    type: OccupantType;

    @IsNumber()
    @IsNotEmpty()
    age: number;
}

export class RoomingItemDto {
    @IsNumber()
    @IsNotEmpty()
    roomId: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OccupantDto)
    @IsNotEmpty()
    occupants: OccupantDto[];
}

export class SimulationRequestDto {
    @IsNumber()
    @IsNotEmpty()
    contractId: number;

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

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RoomingItemDto)
    @IsNotEmpty()
    roomingList: RoomingItemDto[];
}
