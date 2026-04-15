import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Hotel } from '../hotel/entities/hotel.entity';
import { ExchangeRateController } from './exchange-rate.controller';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRate } from './entities/exchange-rate.entity';

@Module({
    imports: [TypeOrmModule.forFeature([ExchangeRate, Hotel])],
    controllers: [ExchangeRateController],
    providers: [ExchangeRateService],
    exports: [ExchangeRateService, TypeOrmModule],
})
export class ExchangeRatesModule {}
