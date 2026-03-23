import { PartialType } from '@nestjs/mapped-types';
import { CreateTemplateSpoDto } from './create-template-spo.dto';

export class UpdateTemplateSpoDto extends PartialType(CreateTemplateSpoDto) { }
