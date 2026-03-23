import { PartialType } from '@nestjs/mapped-types';
import { CreateTemplateMonoparentalRuleDto } from './create-template-monoparental-rule.dto';

export class UpdateTemplateMonoparentalRuleDto extends PartialType(CreateTemplateMonoparentalRuleDto) { }
