import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateAffiliateEmailSpoDto } from './create-affiliate-email-spo.dto';

export class BulkCreateAffiliateEmailSpoDto extends CreateAffiliateEmailSpoDto {
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(200)
    @Type(() => Number)
    @IsInt({ each: true })
    affiliateIds: number[];
}
