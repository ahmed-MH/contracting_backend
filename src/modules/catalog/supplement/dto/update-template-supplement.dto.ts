import { PartialType } from '@nestjs/mapped-types';
import { CreateTemplateSupplementDto } from './create-template-supplement.dto';

export class UpdateTemplateSupplementDto extends PartialType(CreateTemplateSupplementDto) { }
