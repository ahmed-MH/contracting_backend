import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Hotel } from '../hotel/entities/hotel.entity';
import { CurrencyConversionService } from './currency-conversion.service';
import { ExchangeRateController } from './exchange-rate.controller';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRate } from './entities/exchange-rate.entity';

@Module({
    imports: [TypeOrmModule.forFeature([ExchangeRate, Hotel])],
    controllers: [ExchangeRateController],
    providers: [ExchangeRateService, CurrencyConversionService],
    exports: [ExchangeRateService, CurrencyConversionService, TypeOrmModule],
})
export class ExchangeRatesModule {}
