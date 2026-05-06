import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { ProformaSequence } from './entities/proforma-sequence.entity';
import { Hotel } from '../hotel/entities/hotel.entity';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { ProformaController } from './proforma.controller';
import { ProformaService } from './proforma.service';
import { ProformaPdfService } from './proforma-pdf.service';
import { ProformaStartupService } from './proforma-startup.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ProformaInvoice,
            ProformaSequence,
            Hotel,
        ]),
        ExchangeRatesModule,
    ],
    controllers: [ProformaController],
    providers: [ProformaService, ProformaPdfService, ProformaStartupService],
    exports: [ProformaService],
})
export class ProformaModule {}
