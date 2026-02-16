import { PartialType } from '@nestjs/mapped-types';
import { CreateArrangementDto } from './create-arrangement.dto';

export class UpdateArrangementDto extends PartialType(CreateArrangementDto) { }
