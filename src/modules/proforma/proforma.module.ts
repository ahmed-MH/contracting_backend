import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { ProformaSequence } from './entities/proforma-sequence.entity';
import { ProformaController } from './proforma.controller';
import { ProformaService } from './proforma.service';
import { ProformaPdfService } from './proforma-pdf.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ProformaInvoice,
            ProformaSequence,
        ]),
    ],
    controllers: [ProformaController],
    providers: [ProformaService, ProformaPdfService],
    exports: [ProformaService],
})
export class ProformaModule {}
