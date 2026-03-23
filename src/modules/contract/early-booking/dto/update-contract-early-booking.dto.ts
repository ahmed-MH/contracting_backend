import {
    IsString,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsBoolean,
    IsDateString,
    IsArray,
    IsInt,
    Min,
    ValidateIf,
    IsEnum,
    ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReductionCalculationType, PricingModifierApplicationType } from '../../../../common/constants/enums';

class ApplicablePeriodOverrideDto {
    @IsInt()
    periodId: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    overrideValue?: number;
}

export class UpdateContractEarlyBookingDto {
    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsNotEmpty()
    @IsOptional()
    name?: string;

    @IsEnum(ReductionCalculationType)
    @IsOptional()
    calculationType?: ReductionCalculationType;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @IsOptional()
    value?: number;

    @IsInt()
    @Min(0)
    @IsOptional()
    releaseDays?: number;

    // ZONE A: Windows
    @ValidateIf((o: any) => o.bookingWindowStart !== null)
    @IsOptional()
    @IsDateString()
    bookingWindowStart?: Date | null;

    @ValidateIf((o: any) => o.bookingWindowEnd !== null)
    @IsOptional()
    @IsDateString()
    bookingWindowEnd?: Date | null;

    @ValidateIf((o: any) => o.stayWindowStart !== null)
    @IsOptional()
    @IsDateString()
    stayWindowStart?: Date | null;

    @ValidateIf((o: any) => o.stayWindowEnd !== null)
    @IsOptional()
    @IsDateString()
    stayWindowEnd?: Date | null;

    // ZONE B: Prepaid Conditions
    @IsBoolean()
    @IsOptional()
    isPrepaid?: boolean;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    prepaymentPercentage?: number;

    @ValidateIf((o: any) => o.prepaymentDeadlineDate !== null)
    @IsOptional()
    @IsDateString()
    prepaymentDeadlineDate?: Date | null;

    @ValidateIf((o: any) => o.roomingListDeadlineDate !== null)
    @IsOptional()
    @IsDateString()
    roomingListDeadlineDate?: Date | null;

    // Targeting
    @IsArray()
    @IsInt({ each: true })
    @IsOptional()
    applicableContractRoomIds?: number[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ApplicablePeriodOverrideDto)
    @IsOptional()
    applicablePeriods?: ApplicablePeriodOverrideDto[];

    @IsEnum(PricingModifierApplicationType)
    @IsOptional()
    applicationType?: PricingModifierApplicationType;
}
