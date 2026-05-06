import { plainToInstance } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    validate,
} from 'class-validator';
import { IntegrationPublicError } from '../integration-public-error';

export class ReservationQuoteRequestDto {
    @IsString()
    @MaxLength(100)
    requestId: string;

    @IsString()
    @MaxLength(100)
    hotelCode: string;

    @IsString()
    @MaxLength(100)
    partnerCode: string;

    @IsDateString()
    reservationDate: string;

    @IsDateString()
    checkIn: string;

    @IsDateString()
    checkOut: string;

    @IsString()
    @MaxLength(3)
    currency: string;

    @IsString()
    @MaxLength(100)
    roomTypeCode: string;

    @IsString()
    @MaxLength(100)
    boardCode: string;

    @IsInt()
    @Min(1)
    adults: number;

    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    @Min(0, { each: true })
    childrenAges?: number[];
}

export async function validateReservationQuoteRequest(
    input: unknown,
): Promise<ReservationQuoteRequestDto> {
    const dto = plainToInstance(ReservationQuoteRequestDto, input);
    if (!Array.isArray(dto.childrenAges)) {
        dto.childrenAges = [];
    }

    const errors = await validate(dto as object, {
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false },
    });

    if (errors.length > 0) {
        const messages = errors
            .flatMap((error) => Object.values(error.constraints ?? {}))
            .filter(Boolean);
        throw new IntegrationPublicError(
            'INVALID_PAYLOAD',
            400,
            messages[0] ?? 'The quote request payload is invalid.',
        );
    }

    if (new Date(dto.checkOut).getTime() <= new Date(dto.checkIn).getTime()) {
        throw new IntegrationPublicError(
            'INVALID_PAYLOAD',
            400,
            'checkOut must be after checkIn.',
        );
    }

    dto.currency = dto.currency.toUpperCase();
    return dto;
}
