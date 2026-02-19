import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Affiliate } from './entities/affiliate.entity';
import { AffiliateService } from './affiliate.service';
import { AffiliateController } from './affiliate.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Affiliate])],
    controllers: [AffiliateController],
    providers: [AffiliateService],
    exports: [AffiliateService],
})
export class AffiliateModule { }
