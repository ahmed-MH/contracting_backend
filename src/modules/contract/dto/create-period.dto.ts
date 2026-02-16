import { IsString, IsNotEmpty, IsDateString, IsInt } from 'class-validator';

export class CreatePeriodDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date string' })
    startDate: string;

    @IsDateString({}, { message: 'endDate must be a valid ISO 8601 date string' })
    endDate: string;

    @IsInt()
    contractId: number;
}
