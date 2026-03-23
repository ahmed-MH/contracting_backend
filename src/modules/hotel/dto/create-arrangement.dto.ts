import { Transform } from 'class-transformer';
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    MaxLength,
    IsInt,
} from 'class-validator';

function toTitleCase(value: string): string {
    return value.replace(/\w\S*/g, (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    );
}

export class CreateArrangementDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(5, { message: 'Arrangement code must be 5 characters max' })
    @Transform(({ value }: { value: string }) => value.trim().toUpperCase())
    code: string;

    @IsString()
    @IsNotEmpty()
    @Transform(({ value }: { value: string }) => toTitleCase(value.trim()))
    name: string;

    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsInt()
    @IsOptional()
    level?: number;
}
