import { PartialType } from '@nestjs/mapped-types';
import { CreateTemplateEarlyBookingDto } from './create-template-early-booking.dto';

export class UpdateTemplateEarlyBookingDto extends PartialType(CreateTemplateEarlyBookingDto) { }
