import { IsInt } from 'class-validator';

export class ImportEarlyBookingDto {
    @IsInt()
    templateId: number;
}
