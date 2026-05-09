import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';
import { PageOptionsDto } from '../../../common/dto/page-options.dto';

export class ListIssuedProformasDto extends PageOptionsDto {
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @IsOptional()
    affiliateId?: number;

    @IsDateString()
    @IsOptional()
    issuedFrom?: string;

    @IsDateString()
    @IsOptional()
    issuedTo?: string;
}
