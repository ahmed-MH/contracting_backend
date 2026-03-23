import { IsInt } from 'class-validator';

export class ImportSpoDto {
    @IsInt()
    templateId: number;
}
