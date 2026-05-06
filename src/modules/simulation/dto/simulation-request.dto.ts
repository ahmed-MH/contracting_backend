import { IsNumber, IsNotEmpty, IsDateString, IsOptional, ValidateNested, IsArray, IsEnum, Min, IsBoolean, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';

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

    @IsNumber()
    @IsOptional()
    boardTypeId?: number;

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
    affiliateId: number;

    @IsNumber()
    @IsOptional()
    boardTypeId?: number;

    @IsDateString()
    @IsNotEmpty()
    checkIn: string;

    @IsDateString()
    @IsNotEmpty()
    checkOut: string;

    @IsDateString()
    @IsOptional()
    bookingDate?: string;

    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true')
    @IsBoolean()
    includeInactive?: boolean;

    @IsString()
    @IsOptional()
    inactiveOverrideReason?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RoomingItemDto)
    @IsNotEmpty()
    roomingList: RoomingItemDto[];
}
