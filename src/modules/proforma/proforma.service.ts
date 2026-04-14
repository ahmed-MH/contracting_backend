import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, DeepPartial, Repository } from 'typeorm';
import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { ProformaSequence } from './entities/proforma-sequence.entity';
import { CreateProformaDto } from './dto/create-proforma.dto';
import { ProformaInvoiceStatus } from '../../common/constants/enums';

@Injectable()
export class ProformaService {
    constructor(
        @InjectRepository(ProformaInvoice)
        private readonly proformaRepo: Repository<ProformaInvoice>,
        @InjectRepository(ProformaSequence)
        private readonly sequenceRepo: Repository<ProformaSequence>,
        private readonly dataSource: DataSource,
    ) {}

    /**
     * Create a proforma invoice with a safe, transactionally-locked reference.
     */
    async create(
        hotelId: number,
        userId: number,
        dto: CreateProformaDto,
    ): Promise<ProformaInvoice> {
        const reference = await this.generateReference(hotelId);

        const data: DeepPartial<ProformaInvoice> = {
            hotelId,
            affiliateId: dto.affiliateId,
            contractId: dto.contractId,
            generatedByUserId: userId,
            reference,
            status: ProformaInvoiceStatus.GENERATED,
            currency: dto.currency,
            customerName: dto.customerName,
            customerEmail: dto.customerEmail ?? undefined,
            checkIn: dto.checkIn as any,
            checkOut: dto.checkOut as any,
            bookingDate: dto.bookingDate as any,
            boardTypeName: dto.boardTypeName,
            roomingSummary: dto.roomingSummary,
            simulationInputSnapshot: dto.simulationInput,
            calculationSnapshot: dto.calculationResult,
            totalsSnapshot: dto.totals,
            notes: dto.notes ?? undefined,
            generatedAt: new Date(),
        };

        const proforma = this.proformaRepo.create(data);
        return this.proformaRepo.save(proforma);
    }

    /**
     * List all proformas for a hotel, newest first.
     */
    async findAll(hotelId: number): Promise<ProformaInvoice[]> {
        return this.proformaRepo.find({
            where: { hotelId },
            order: { generatedAt: 'DESC' },
        });
    }

    /**
     * Get a single proforma by ID, scoped to hotel.
     */
    async findOne(hotelId: number, id: number): Promise<ProformaInvoice> {
        const proforma = await this.proformaRepo.findOne({
            where: { id, hotelId },
            relations: ['hotel', 'affiliate'],
        });

        if (!proforma) {
            throw new NotFoundException(`Proforma #${id} not found`);
        }

        return proforma;
    }

    /**
     * Generate a unique PF-YYYY-NNNN reference using a dedicated sequence table
     * with a serializable transaction to prevent duplicates under concurrency.
     */
    private async generateReference(hotelId: number): Promise<string> {
        const year = new Date().getFullYear();

        return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
            const seqRepo = manager.getRepository(ProformaSequence);

            // Try to find existing sequence row for this hotel+year
            let seq = await seqRepo.findOne({
                where: { hotelId, year },
            });

            if (!seq) {
                // First proforma of the year for this hotel
                seq = seqRepo.create({ hotelId, year, lastSequence: 0 });
            }

            seq.lastSequence += 1;
            await seqRepo.save(seq);

            return `PF-${year}-${String(seq.lastSequence).padStart(4, '0')}`;
        });
    }
}
