import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PublicSignupStatus } from '../../../common/constants/enums';

export class ListPublicSignupsQueryDto {
    @IsOptional()
    @IsEnum(PublicSignupStatus)
    status?: PublicSignupStatus;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number;
}
