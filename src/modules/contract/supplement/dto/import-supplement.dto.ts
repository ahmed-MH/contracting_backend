import { IsInt } from 'class-validator';

export class ImportSupplementDto {
    @IsInt()
    templateId: number;
}
