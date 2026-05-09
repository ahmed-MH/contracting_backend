import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Affiliate } from './entities/affiliate.entity';
import { AffiliateService } from './affiliate.service';
import { AffiliateController } from './affiliate.controller';
import { AffiliateEmailSpo } from './email-spo/entities/affiliate-email-spo.entity';
import { AffiliateEmailSpoService } from './email-spo/affiliate-email-spo.service';
import { AffiliateEmailSpoBulkController, AffiliateEmailSpoController } from './email-spo/affiliate-email-spo.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Affiliate, AffiliateEmailSpo])],
    controllers: [AffiliateController, AffiliateEmailSpoBulkController, AffiliateEmailSpoController],
    providers: [AffiliateService, AffiliateEmailSpoService],
    exports: [AffiliateService, AffiliateEmailSpoService],
})
export class AffiliateModule { }
