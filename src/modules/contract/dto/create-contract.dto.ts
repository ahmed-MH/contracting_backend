import { IsString, IsNotEmpty, IsDateString, IsInt, Length } from 'class-validator';

export class CreateContractDto {
    @IsString()
    @IsNotEmpty()
    code: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date string' })
    startDate: string;

    @IsDateString({}, { message: 'endDate must be a valid ISO 8601 date string' })
    endDate: string;

    @IsString()
    @Length(3, 3, { message: 'Currency must be a 3-letter ISO code (e.g. TND, EUR)' })
    currency: string;

    @IsInt()
    affiliateId: number;
}
