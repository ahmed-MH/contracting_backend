import {
    IsString,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsBoolean,
    IsDateString,
    Min,
    ValidateIf,
    IsEnum,
    IsInt
} from 'class-validator';
import { ReductionCalculationType, PricingModifierApplicationType } from '../../../../common/constants/enums';

export class CreateTemplateEarlyBookingDto {
    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEnum(ReductionCalculationType)
    calculationType: ReductionCalculationType;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    value: number;

    @IsEnum(PricingModifierApplicationType)
    @IsOptional()
    applicationType?: PricingModifierApplicationType;

    @IsInt()
    @Min(0)
    releaseDays: number;

    // ZONE A: Windows
    @ValidateIf((o: CreateTemplateEarlyBookingDto) => o.bookingWindowStart !== null)
    @IsOptional()
    @IsDateString()
    bookingWindowStart?: string | null;

    @ValidateIf((o: CreateTemplateEarlyBookingDto) => o.bookingWindowEnd !== null)
    @IsOptional()
    @IsDateString()
    bookingWindowEnd?: string | null;

    @ValidateIf((o: CreateTemplateEarlyBookingDto) => o.stayWindowStart !== null)
    @IsOptional()
    @IsDateString()
    stayWindowStart?: string | null;

    @ValidateIf((o: CreateTemplateEarlyBookingDto) => o.stayWindowEnd !== null)
    @IsOptional()
    @IsDateString()
    stayWindowEnd?: string | null;

    // ZONE B: Prepaid Conditions

    @IsBoolean()
    @IsOptional()
    isPrepaid?: boolean;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    prepaymentPercentage?: number;

    @ValidateIf((o: CreateTemplateEarlyBookingDto) => o.prepaymentDeadlineDate !== null)
    @IsOptional()
    @IsDateString()
    prepaymentDeadlineDate?: string | null;

    @ValidateIf((o: CreateTemplateEarlyBookingDto) => o.roomingListDeadlineDate !== null)
    @IsOptional()
    @IsDateString()
    roomingListDeadlineDate?: string | null;
}
