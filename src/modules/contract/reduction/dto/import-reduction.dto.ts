import { IsInt } from 'class-validator';

export class ImportReductionDto {
    @IsInt()
    templateId: number;
}
