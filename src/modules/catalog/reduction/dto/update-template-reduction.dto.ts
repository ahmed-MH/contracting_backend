import { PartialType } from '@nestjs/mapped-types';
import { CreateTemplateReductionDto } from './create-template-reduction.dto';

export class UpdateTemplateReductionDto extends PartialType(CreateTemplateReductionDto) { }
