import { IsInt } from 'class-validator';

export class ImportMonoparentalRuleDto {
    @IsInt()
    templateId: number;
}
