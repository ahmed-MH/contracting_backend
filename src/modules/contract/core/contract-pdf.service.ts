import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Contract } from './entities/contract.entity';
import { ContractLine } from './entities/contract-line.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { ContractSupplement } from '../supplement/entities/contract-supplement.entity';
import { ContractReduction } from '../reduction/entities/contract-reduction.entity';
import { ContractMonoparentalRule } from '../monoparental/entities/contract-monoparental-rule.entity';
import { ContractEarlyBooking } from '../early-booking/entities/contract-early-booking.entity';
import { ContractSpo } from '../spo/entities/contract-spo.entity';
import { ContractCancellationRule } from '../cancellation/entities/contract-cancellation-rule.entity';
import { ContractPDFGenerator } from './contract-pdf.generator';
import { Affiliate } from '../../affiliate/entities/affiliate.entity';
import { ContractExportSnapshot } from './entities/contract-export-snapshot.entity';
import { ContractExportPresentationService } from './contract-export-presentation.service';

export interface ContractPdfExportOptions {
    partnerId?: string;
    language?: string;
    currency?: string;
    generatedBy?: number | null;
}

/**
 * Fetches live contract data and delegates the printable document layout to
 * ContractPDFGenerator so the backend PDF mirrors the React preview structure.
 */
@Injectable()
export class ContractPdfService {
    constructor(
        @InjectRepository(Contract)
        private readonly contractRepo: Repository<Contract>,

        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,

        @InjectRepository(ContractExportSnapshot)
        private readonly exportSnapshotRepo: Repository<ContractExportSnapshot>,

        private readonly presentationService: ContractExportPresentationService,

        private readonly dataSource: DataSource,
    ) {}

    async generate(hotelId: number, contractId: number, options: ContractPdfExportOptions): Promise<{ buffer: Buffer; filename: string }> {
        const partnerId = Number(options.partnerId);
        if (!partnerId || Number.isNaN(partnerId)) {
            throw new BadRequestException('partnerId query parameter is required to generate a contract PDF.');
        }

        const contract = await this.contractRepo.findOne({
            where: { id: contractId, hotelId },
            relations: [
                'affiliates',
                'periods',
                'contractRooms',
                'contractRooms.roomType',
                'baseArrangement',
            ],
        });

        if (!contract) {
            throw new NotFoundException(`Contract #${contractId} not found in hotel #${hotelId}`);
        }

        const selectedPartner = this.resolveContractPartner(contract, partnerId);

        const [
            hotel,
            contractLines,
            supplements,
            reductions,
            monoparentalRules,
            earlyBookings,
            spos,
            cancellations,
        ] = await Promise.all([
            this.hotelRepo.findOne({ where: { id: hotelId } }),
            this.fetchContractLines(contractId),
            this.fetchSupplements(contractId),
            this.fetchReductions(contractId),
            this.fetchMonoparentalRules(contractId),
            this.fetchEarlyBookings(contractId),
            this.fetchSpos(contractId),
            this.fetchCancellations(contractId),
        ]);

        for (const line of contractLines) {
            line.prices = this.selectBasePrices(line.prices ?? [], contract.baseArrangementId);
        }

        const presentation = await this.presentationService.buildContext(contract, hotel, options.language, options.currency);
        const sourceModel = {
            contract,
            hotel,
            selectedPartner,
            contractLines,
            supplements,
            reductions,
            monoparentalRules,
            earlyBookings,
            spos,
            cancellations,
            presentation,
        };
        const exportModel = this.presentationService.apply(sourceModel, presentation);
        const generator = new ContractPDFGenerator();
        const buffer = await generator.generate(exportModel);
        await this.persistSnapshot(contract.id, selectedPartner.id, presentation, options.generatedBy ?? null);

        const filename = `contract-${this.slugFilename(contract.name, String(contract.id))}-${this.slugFilename(selectedPartner.companyName, 'partner')}-${presentation.language}-${presentation.outputCurrency.toLowerCase()}.pdf`;

        return { buffer, filename };
    }

    private resolveContractPartner(contract: Contract, partnerId: number): Affiliate {
        const selectedPartner = (contract.affiliates ?? []).find((affiliate) => affiliate.id === partnerId);
        if (!selectedPartner) {
            throw new BadRequestException(`Partner #${partnerId} is not assigned to contract #${contract.id}.`);
        }
        return selectedPartner;
    }

    private safeFilename(value?: string | null, fallback = 'Contract'): string {
        const cleaned = (value || fallback)
            .trim()
            .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/[. ]+$/g, '');

        return cleaned || fallback;
    }

    private slugFilename(value?: string | null, fallback = 'contract'): string {
        return this.safeFilename(value, fallback)
            .toLowerCase()
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-+|-+$/g, '') || fallback;
    }

    private async persistSnapshot(
        contractId: number,
        partnerId: number,
        presentation: Awaited<ReturnType<ContractExportPresentationService['buildContext']>>,
        generatedBy: number | null,
    ): Promise<void> {
        await this.exportSnapshotRepo.save(this.exportSnapshotRepo.create({
            contractId,
            partnerId,
            language: presentation.language,
            outputCurrency: presentation.outputCurrency,
            exchangeRateSource: presentation.fx.source,
            exchangeRateValuesUsed: {
                sourceCurrency: presentation.sourceCurrency,
                outputCurrency: presentation.outputCurrency,
                rate: presentation.fx.rate,
                rateDate: presentation.fx.rateDate,
                valuesUsed: presentation.fx.valuesUsed,
            },
            generatedBy: generatedBy ?? null,
        }));
    }

    private fetchContractLines(contractId: number): Promise<ContractLine[]> {
        return this.dataSource.getRepository(ContractLine)
            .createQueryBuilder('contractLine')
            .leftJoinAndSelect('contractLine.period', 'period')
            .leftJoinAndSelect('contractLine.contractRoom', 'contractRoom')
            .leftJoinAndSelect('contractRoom.roomType', 'roomType')
            .leftJoinAndSelect('contractLine.prices', 'prices')
            .leftJoinAndSelect('prices.arrangement', 'arrangement')
            .where('period.contractId = :contractId', { contractId })
            .orderBy('period.startDate', 'ASC')
            .addOrderBy('roomType.name', 'ASC')
            .getMany();
    }

    private selectBasePrices(prices: ContractLine['prices'], baseArrangementId?: number | null): ContractLine['prices'] {
        if (!prices?.length) return [];
        const basePrice = baseArrangementId
            ? prices.find((price) => price.arrangement?.id === baseArrangementId)
            : undefined;
        return [basePrice ?? prices[0]];
    }

    private fetchSupplements(contractId: number): Promise<ContractSupplement[]> {
        return this.dataSource.getRepository(ContractSupplement).find({
            where: { contract: { id: contractId } },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicableContractRooms.contractRoom.roomType',
                'applicablePeriods',
                'applicablePeriods.period',
                'targetArrangement',
            ],
            order: { id: 'ASC' },
        });
    }

    private fetchReductions(contractId: number): Promise<ContractReduction[]> {
        return this.dataSource.getRepository(ContractReduction).find({
            where: { contract: { id: contractId } },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicableContractRooms.contractRoom.roomType',
                'applicablePeriods',
                'applicablePeriods.period',
            ],
            order: { id: 'ASC' },
        });
    }

    private fetchMonoparentalRules(contractId: number): Promise<ContractMonoparentalRule[]> {
        return this.dataSource.getRepository(ContractMonoparentalRule).find({
            where: { contract: { id: contractId } },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicableContractRooms.contractRoom.roomType',
                'applicablePeriods',
                'applicablePeriods.period',
            ],
            order: { id: 'ASC' },
        });
    }

    private fetchEarlyBookings(contractId: number): Promise<ContractEarlyBooking[]> {
        return this.dataSource.getRepository(ContractEarlyBooking).find({
            where: { contract: { id: contractId } },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicableContractRooms.contractRoom.roomType',
                'applicablePeriods',
                'applicablePeriods.period',
            ],
            order: { id: 'ASC' },
        });
    }

    private fetchSpos(contractId: number): Promise<ContractSpo[]> {
        return this.dataSource.getRepository(ContractSpo).find({
            where: { contract: { id: contractId } },
            relations: [
                'applicableContractRooms',
                'applicableContractRooms.contractRoom',
                'applicableContractRooms.contractRoom.roomType',
                'applicablePeriods',
                'applicablePeriods.period',
                'applicableArrangements',
                'applicableArrangements.arrangement',
            ],
            order: { id: 'ASC' },
        });
    }

    private fetchCancellations(contractId: number): Promise<ContractCancellationRule[]> {
        return this.dataSource.getRepository(ContractCancellationRule).find({
            where: { contract: { id: contractId } },
            relations: [
                'applicableRooms',
                'applicableRooms.contractRoom',
                'applicableRooms.contractRoom.roomType',
                'applicablePeriods',
                'applicablePeriods.period',
            ],
            order: { daysBeforeArrival: 'ASC' },
        });
    }
}
