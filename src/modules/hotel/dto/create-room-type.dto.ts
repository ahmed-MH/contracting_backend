import { Transform } from 'class-transformer';
import {
    IsString,
    IsNotEmpty,
    IsInt,
    IsBoolean,
    IsOptional,
    MaxLength,
    Min,
} from 'class-validator';

// Title Case: capitalize first letter of each word
function toTitleCase(value: string): string {
    return value.replace(/\w\S*/g, (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    );
}

export class CreateRoomTypeDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(4, { message: 'Room type code must be 4 characters max' })
    @Transform(({ value }: { value: string }) => value.trim().toUpperCase())
    code: string;

    @IsString()
    @IsNotEmpty()
    @Transform(({ value }: { value: string }) => toTitleCase(value.trim()))
    name: string;

    @IsInt()
    @Min(1)
    minOccupancy: number;

    @IsInt()
    @Min(1)
    maxOccupancy: number;

    @IsInt()
    @Min(1)
    minAdults: number;

    @IsInt()
    @Min(1)
    maxAdults: number;

    @IsInt()
    @Min(0)
    minChildren: number;

    @IsInt()
    @Min(0)
    maxChildren: number;

    @IsBoolean()
    @IsOptional()
    allowCotOverMax?: boolean;
}
