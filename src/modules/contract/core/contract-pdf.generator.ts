import { existsSync } from 'fs';
import PDFDocument = require('pdfkit');
import { Contract } from './entities/contract.entity';
import { ContractLine } from './entities/contract-line.entity';
import { Hotel } from '../../hotel/entities/hotel.entity';
import { ContractSupplement } from '../supplement/entities/contract-supplement.entity';
import { ContractReduction } from '../reduction/entities/contract-reduction.entity';
import { ContractMonoparentalRule } from '../monoparental/entities/contract-monoparental-rule.entity';
import { ContractEarlyBooking } from '../early-booking/entities/contract-early-booking.entity';
import { ContractSpo } from '../spo/entities/contract-spo.entity';
import { ContractCancellationRule } from '../cancellation/entities/contract-cancellation-rule.entity';
import { Affiliate } from '../../affiliate/entities/affiliate.entity';

export interface ContractPdfGeneratorModel {
    contract: Contract;
    hotel: Hotel | null;
    selectedPartner: Affiliate;
    contractLines: ContractLine[];
    supplements: ContractSupplement[];
    reductions: ContractReduction[];
    monoparentalRules: ContractMonoparentalRule[];
    earlyBookings: ContractEarlyBooking[];
    spos: ContractSpo[];
    cancellations: ContractCancellationRule[];
}

type TableCell = string | number | null | undefined;

interface TableOptions {
    fontSize?: number;
    headerFontSize?: number;
    rowPadding?: number;
    headerHeight?: number;
}

interface TariffRate {
    board: string;
    amount: number;
    minStay?: number;
    releaseDays?: number;
}

interface PeriodMatrixPdfRow {
    key: string | number;
    baseCells: TableCell[];
    periodValues: Map<number, TableCell>;
    applicablePeriodIds: Set<number>;
}

export class ContractPDFGenerator {
    private readonly pageWidth = 595.28;
    private readonly pageHeight = 841.89;
    private readonly margin = 32;
    private readonly footerHeight = 30;
    private readonly contentWidth = this.pageWidth - this.margin * 2;
    private readonly navy = '#0F172A';
    private readonly mint = '#10B981';
    private readonly slate = '#64748B';
    private readonly border = '#AAB4C0';
    private readonly hairline = '#E2E8F0';
    private readonly light = '#F8FAFC';
    private readonly tableHead = '#EEF2F7';
    private readonly text = '#1E293B';
    private readonly maxMatrixPeriods = 7;

    async generate(model: ContractPdfGeneratorModel): Promise<Buffer> {
        const logoImage = await this.resolveLogoImage(model.hotel?.logoUrl);

        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margin: this.margin,
                bufferPages: true,
                info: {
                    Title: `Contract ${model.contract.reference || model.contract.name}`,
                    Author: model.hotel?.name ?? 'Pricify',
                    Subject: 'Hotel commercial agreement',
                },
            });

            const chunks: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            this.drawDocument(doc, model, logoImage);
            this.drawPageNumbers(doc);
            doc.end();
        });
    }

    private drawDocument(doc: PDFKit.PDFDocument, model: ContractPdfGeneratorModel, logoImage: Buffer | string | null): void {
        this.drawHeader(doc, model, logoImage);
        this.drawParties(doc, model);
        this.drawRates(doc, model);
        this.drawSupplementRules(doc, model, '03');
        this.drawReductionRules(doc, model, '04');
        this.drawMonoparentalRules(doc, model, '05');
        this.drawSpoRules(doc, model, '06');
        this.drawEarlyBookingRules(doc, model, '07');
        this.drawCommercialRemarks(doc, '08');
        this.drawPaymentTerms(doc, model, '09');
        this.drawCancellationRules(doc, model, '10');
        this.drawGeneralConditions(doc, '11');
        this.drawSignatures(doc, model);
    }

    private drawHeader(doc: PDFKit.PDFDocument, { contract, hotel, selectedPartner }: ContractPdfGeneratorModel, logoImage: Buffer | string | null): void {
        const topY = this.margin;
        const logoSize = 62;
        const metaWidth = 156;
        const metaX = this.pageWidth - this.margin - metaWidth;
        const titleX = this.margin + logoSize + 16;
        const titleWidth = metaX - titleX - 18;

        doc.save().rect(0, 0, this.pageWidth, 16).fill(this.navy).restore();
        doc.save().rect(this.margin, topY, this.contentWidth, 92).fill('#FFFFFF').strokeColor(this.border).stroke().restore();
        doc.save().rect(this.margin, topY, 5, 92).fill(this.mint).restore();
        this.drawLogo(doc, hotel, this.margin + 14, topY + 15, logoSize, logoImage);

        doc.font('Helvetica-Bold').fontSize(7).fillColor(this.mint)
            .text('HOTEL COMMERCIAL AGREEMENT', titleX, topY + 14, { width: titleWidth, characterSpacing: 1.3 });
        doc.font('Helvetica-Bold').fontSize(16).fillColor(this.navy)
            .text(String(contract.name || 'Seasonal Tariff Agreement').toUpperCase(), titleX, topY + 27, {
                width: titleWidth,
                lineGap: 0.5,
            });
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(this.text)
            .text(hotel?.name ?? 'Hotel', titleX, topY + 58, { width: titleWidth });
        doc.font('Helvetica').fontSize(7.2).fillColor(this.slate)
            .text(this.compactAddress(hotel), titleX, topY + 72, { width: titleWidth, lineGap: 0.5 });

        doc.save().rect(metaX, topY, metaWidth, 92).fill(this.light).strokeColor(this.border).stroke().restore();
        doc.save().rect(metaX, topY, metaWidth, 22).fill(this.navy).restore();
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#FFFFFF')
            .text('AGREEMENT DETAILS', metaX + 10, topY + 8, { width: metaWidth - 20, align: 'center', characterSpacing: 1 });
        this.drawMetaLine(doc, metaX, topY + 31, 'DOCUMENT', this.publicReference(contract.reference));
        this.drawMetaLine(doc, metaX, topY + 49, 'SEASON', contract.name || 'Current season');
        this.drawMetaLine(doc, metaX, topY + 67, 'CURRENCY', contract.currency);

        doc.y = topY + 106;
        this.drawInfoStrip(doc, [
            ['Stay validity', this.formatDateRange(contract.startDate, contract.endDate)],
            ['Rate basis', 'Per person per night'],
            ['Tour operator', selectedPartner.companyName],
        ]);
        doc.y += 8;
    }

    private drawParties(doc: PDFKit.PDFDocument, { hotel, selectedPartner }: ContractPdfGeneratorModel): void {
        this.drawSectionTitle(doc, '01', 'Contracting Parties', 76);

        this.drawTwoCards(doc, [
            {
                title: 'Hotel party',
                body: [
                    hotel?.fiscalName || hotel?.name || 'Hotel company',
                    hotel?.legalRepresentative ? `Authorized representative: ${hotel.legalRepresentative}` : 'Authorized representative: as per signed agreement',
                    hotel?.emails?.[0]?.address ? `Commercial contact: ${hotel.emails[0].address}` : null,
                    hotel?.phone ? `Telephone: ${hotel.phone}` : null,
                ].filter((line): line is string => Boolean(line)).join('\n'),
            },
            {
                title: 'Tour operator party',
                body: this.partnerPartyText(selectedPartner),
            },
        ]);
        doc.y += 8;
    }

    private drawRates(doc: PDFKit.PDFDocument, { contract, contractLines }: ContractPdfGeneratorModel): void {
        this.drawSectionTitle(doc, '02', 'Contractual Tariff', 92);
        this.drawTariffNote(doc, contract);

        const periods = [...(contract.periods ?? [])].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        const rooms = contract.contractRooms ?? [];
        if (periods.length === 0 || rooms.length === 0) {
            this.drawEmpty(doc, 'Tariff grid will be attached by mutual agreement where applicable.');
            return;
        }

        const lookup = new Map<string, TariffRate[]>();
        for (const line of contractLines) {
            if (!line.period || !line.contractRoom) continue;
            lookup.set(
                `${line.period.id}_${line.contractRoom.id}`,
                (line.prices ?? [])
                    .filter((price) => price.arrangement)
                    .map((price) => ({
                        board: price.arrangement?.code || price.arrangement?.name || 'BASE',
                        amount: Number(price.amount) || 0,
                        minStay: price.minStay,
                        releaseDays: price.releaseDays,
                    })),
            );
        }

        for (const periodChunk of this.chunk(periods, this.maxMatrixPeriods)) {
            this.drawTariffTable(doc, contract, rooms, periodChunk, lookup);
            doc.y += 6;
        }
    }

    private paymentItems({ contract, hotel }: ContractPdfGeneratorModel): string[] {
        return [
            contract.paymentCondition ? `Payment condition: ${this.formatPaymentCondition(contract.paymentCondition)}.` : 'Payment condition to be agreed in writing by both parties.',
            contract.depositAmount ? `Deposit: ${this.formatMoney(Number(contract.depositAmount), contract.currency)}.` : null,
            contract.creditDays ? `Credit facility: ${contract.creditDays} day(s) from invoice date.` : null,
            contract.paymentMethods?.length ? `Accepted payment methods: ${contract.paymentMethods.map((method) => this.labelize(method)).join(', ')}.` : null,
            hotel?.bankName ? `Bank: ${hotel.bankName}.` : null,
            hotel?.ibanCode ? `IBAN: ${hotel.ibanCode}.` : null,
        ].filter((item): item is string => Boolean(item));
    }

    private commercialRemarkItems(): string[] {
        return [
            'Rates are confidential and apply only to the contracting parties named herein.',
            'Offers remain subject to allotment, stop sales, release periods, and written hotel confirmation.',
            'Taxes or statutory charges may be adjusted where imposed by competent authorities.',
        ];
    }

    private generalConditionItems(): string[] {
        return [
            'This agreement applies to the stay validity stated above and supersedes unsigned tariff communications for the same season.',
            'Any exception, amendment, special operation, or side letter shall be valid only when accepted in writing by both parties.',
            'The tour operator shall respect release dates, rooming list deadlines, payment deadlines, and cancellation conditions.',
        ];
    }

    private drawCommercialRemarks(doc: PDFKit.PDFDocument, index: string): void {
        this.drawSectionTitle(doc, index, 'Commercial Remarks / Additional Conditions', 72);
        this.drawFullCard(doc, 'Commercial remarks', this.numbered(this.commercialRemarkItems()), 58);
        doc.y += 8;
    }

    private drawPaymentTerms(doc: PDFKit.PDFDocument, model: ContractPdfGeneratorModel, index: string): void {
        this.drawSectionTitle(doc, index, 'Payment Terms', 72);
        const paymentItems = this.paymentItems(model);
        this.drawFullCard(doc, 'Payment terms', this.numbered(paymentItems.length > 0 ? paymentItems : ['Payment terms to be confirmed by the parties.']), 58);
        doc.y += 8;
    }

    private drawGeneralConditions(doc: PDFKit.PDFDocument, index: string): void {
        this.drawSectionTitle(doc, index, 'General Conditions', 72);
        this.drawFullCard(doc, 'General conditions', this.numbered(this.generalConditionItems()), 66);
        doc.y += 8;
    }

    private drawSignatures(doc: PDFKit.PDFDocument, { hotel, selectedPartner }: ContractPdfGeneratorModel): void {
        this.drawSectionTitle(doc, '12', 'Acceptance and Signatures', 136);

        const gap = 16;
        const cardWidth = (this.contentWidth - gap) / 2;
        const y = doc.y;
        const affiliateName = selectedPartner.companyName || 'Tour operator';

        this.drawSignatureCard(doc, this.margin, y, cardWidth, 'For the hotel', hotel?.name ?? 'Hotel', hotel?.legalRepresentative || 'Authorized signatory');
        this.drawSignatureCard(doc, this.margin + cardWidth + gap, y, cardWidth, 'For the tour operator', affiliateName, selectedPartner.representativeName || 'Authorized signatory');
        doc.y = y + 104;

        const boxY = doc.y;
        const third = this.contentWidth / 3;
        ['Place', 'Date', 'Company stamp'].forEach((label, index) => {
            const x = this.margin + third * index;
            doc.save().rect(x, boxY, third, 34).strokeColor(this.border).stroke().restore();
            doc.font('Helvetica-Bold').fontSize(6.5).fillColor(this.slate)
                .text(label.toUpperCase(), x + 8, boxY + 7, { width: third - 16, characterSpacing: 0.8 });
            doc.moveTo(x + 8, boxY + 25).lineTo(x + third - 8, boxY + 25).strokeColor(this.border).stroke();
        });
        doc.y = boxY + 44;

        doc.font('Helvetica').fontSize(6.8).fillColor(this.slate)
            .text('By signing this document, both parties confirm acceptance of the commercial terms, tariff conditions, policies, and validity period stated in this agreement.', this.margin, doc.y, {
                width: this.contentWidth,
                align: 'center',
                lineGap: 1,
            });
    }

    private renderRuleTable(doc: PDFKit.PDFDocument, title: string | null, headers: string[], rows: TableCell[][], emptyLabel?: string): void {
        this.ensureSpace(doc, rows.length > 0 ? 54 : 42);
        if (title) {
            this.drawSubsectionTitle(doc, title, rows.length > 0 ? 32 : 20);
        }
        if (rows.length === 0) {
            if (emptyLabel) this.drawEmpty(doc, emptyLabel);
            return;
        }
        const width = this.contentWidth / headers.length;
        this.drawTable(doc, headers, headers.map(() => width), rows, { fontSize: 6.7, headerFontSize: 5.9, rowPadding: 4, headerHeight: 21 });
        doc.y += 5;
    }

    private renderPeriodMatrix(
        doc: PDFKit.PDFDocument,
        title: string | null,
        matrixBaseHeaders: string[],
        matrixRows: PeriodMatrixPdfRow[],
        periods: Contract['periods'],
        emptyLabel?: string,
    ): void {
        const hasRows = matrixRows.length > 0 && periods.length > 0;
        this.ensureSpace(doc, hasRows ? 54 : 42);
        if (title) {
            this.drawSubsectionTitle(doc, title, hasRows ? 32 : 20);
        }

        if (!hasRows) {
            if (emptyLabel) this.drawEmpty(doc, emptyLabel);
            return;
        }

        const periodChunks = this.chunk(this.sortedPeriods(periods), this.maxMatrixPeriods);
        for (const [chunkIndex, periodChunk] of periodChunks.entries()) {
            if (chunkIndex > 0) {
                this.drawContinuationLabel(doc, periodChunk);
            }
            const periodWidth = Math.max(43, Math.min(64, (this.contentWidth * 0.58) / periodChunk.length));
            const baseTotalWidth = this.contentWidth - periodWidth * periodChunk.length;
            const baseWidths = this.baseColumnWidths(baseTotalWidth, matrixBaseHeaders.length);
            const headers = [
                ...matrixBaseHeaders,
                ...periodChunk.map((period) => `${this.normalizePeriodName(period.name)}\n${this.formatDateRange(period.startDate, period.endDate)}`),
            ];
            const widths = [...baseWidths, ...periodChunk.map(() => periodWidth)];
            const rows = matrixRows.map((row) => [
                ...row.baseCells,
                ...periodChunk.map((period) => row.applicablePeriodIds.has(period.id) ? row.periodValues.get(period.id) : '-'),
            ]);

            this.drawTable(doc, headers, widths, rows, {
                fontSize: periodChunk.length > 5 ? 5.7 : 6.1,
                headerFontSize: periodChunk.length > 5 ? 4.9 : 5.2,
                rowPadding: 3.2,
                headerHeight: 28,
            });
            doc.y += 4;
        }
    }

    private drawEarlyBookingRules(doc: PDFKit.PDFDocument, { contract, earlyBookings }: ContractPdfGeneratorModel, index: string): void {
        this.drawSectionTitle(doc, index, 'Early Booking', 70);
        const rows = this.sortEarlyBookings(earlyBookings).map((offer) => [
            this.cleanEarlyBookingName(offer, contract.currency),
            this.earlyBookingPeriodValue(offer, null, contract.currency),
            this.formatBookingWindow(offer.bookingWindowStart, offer.bookingWindowEnd),
            this.formatStayWindow(offer.stayWindowStart, offer.stayWindowEnd),
            this.earlyBookingConditions(offer),
            this.roomScope(offer.applicableContractRooms),
        ]);

        if (rows.length === 0) {
            this.drawEmpty(doc, 'No early booking clause has been appended to this agreement.');
            return;
        }

        this.drawTable(
            doc,
            ['Offer', 'Advantage', 'Booking window', 'Stay validity', 'Conditions', 'Room scope'],
            [82, 55, 92, 92, 118, 92],
            rows,
            { fontSize: 6.2, headerFontSize: 5.3, rowPadding: 3.4, headerHeight: 20 },
        );
        doc.y += 5;
    }

    private drawSpoRules(doc: PDFKit.PDFDocument, { contract, spos }: ContractPdfGeneratorModel, index: string): void {
        const periods = this.sortedPeriods(contract.periods);
        const matrixRows: PeriodMatrixPdfRow[] = spos.map((spo) => {
            const applicablePeriods = this.resolveRulePeriods(periods, spo.applicablePeriods as any[]);
            const trigger = spo.conditionType === 'MIN_NIGHTS'
                ? `Minimum stay ${spo.conditionValue ?? spo.stayNights} nights`
                : this.labelize(spo.conditionType);
            const scope = this.compactScope([trigger, this.labelize(spo.applicationType), this.roomScope(spo.applicableContractRooms)]);
            return {
                key: spo.id,
                baseCells: [spo.name, scope],
                applicablePeriodIds: new Set(applicablePeriods.map((period) => period.id)),
                periodValues: new Map(applicablePeriods.map((period) => {
                    const target = this.findPeriodTarget(spo.applicablePeriods as any[], period.id);
                    return [period.id, this.spoPeriodBenefit(spo, target?.overrideValue, contract.currency)];
                })),
            };
        });

        this.drawSectionTitle(doc, index, 'Special Offers', 70);
        this.renderPeriodMatrix(doc, null, ['Offer', 'Trigger / scope'], matrixRows, periods,
            'No special offer clause has been appended to this agreement.');
    }

    private drawSupplementRules(doc: PDFKit.PDFDocument, { contract, supplements }: ContractPdfGeneratorModel, index: string): void {
        const periods = this.sortedPeriods(contract.periods);
        const matrixRows: PeriodMatrixPdfRow[] = supplements.map((supplement) => {
            const applicablePeriods = this.resolveRulePeriods(periods, supplement.applicablePeriods as any[]);
            const name = `${supplement.name}${supplement.isMandatory ? ' (compulsory)' : ''}`;
            const scope = this.compactScope([
                this.roomScope(supplement.applicableContractRooms),
                this.ageRange(supplement.minAge, supplement.maxAge),
                this.labelize(supplement.applicationType),
            ]);
            return {
                key: supplement.id,
                baseCells: [name, scope],
                applicablePeriodIds: new Set(applicablePeriods.map((period) => period.id)),
                periodValues: new Map(applicablePeriods.map((period) => {
                    const target = this.findPeriodTarget(supplement.applicablePeriods as any[], period.id);
                    return [period.id, this.supplementPeriodValue(supplement, target?.overrideValue, contract.currency)];
                })),
            };
        });

        this.drawSectionTitle(doc, index, 'Supplements', 70);
        this.renderPeriodMatrix(doc, null, ['Supplement', 'Scope'], matrixRows, periods,
            'No supplement clause has been appended to this agreement.');
    }

    private drawReductionRules(doc: PDFKit.PDFDocument, { contract, reductions }: ContractPdfGeneratorModel, index: string): void {
        const periods = this.sortedPeriods(contract.periods);
        const matrixRows: PeriodMatrixPdfRow[] = reductions.map((reduction) => {
            const applicablePeriods = this.resolveRulePeriods(periods, reduction.applicablePeriods as any[]);
            const passengerBasis = this.compactScope([
                `${this.labelize(reduction.paxType)} ${reduction.paxOrder ? `#${reduction.paxOrder}` : ''}`.trim(),
                this.ageRange(reduction.minAge, reduction.maxAge),
                this.roomScope(reduction.applicableContractRooms),
            ]);
            return {
                key: reduction.id,
                baseCells: [reduction.name, passengerBasis],
                applicablePeriodIds: new Set(applicablePeriods.map((period) => period.id)),
                periodValues: new Map(applicablePeriods.map((period) => {
                    const target = this.findPeriodTarget(reduction.applicablePeriods as any[], period.id);
                    return [period.id, this.reductionPeriodValue(reduction, target?.overrideValue, contract.currency)];
                })),
            };
        });

        this.drawSectionTitle(doc, index, 'Reductions', 70);
        this.renderPeriodMatrix(doc, null, ['Reduction', 'Pax'], matrixRows, periods,
            'No reduction clause has been appended to this agreement.');
    }

    private drawMonoparentalRules(doc: PDFKit.PDFDocument, { contract, monoparentalRules }: ContractPdfGeneratorModel, index: string): void {
        const periods = this.sortedPeriods(contract.periods);
        const matrixRows: PeriodMatrixPdfRow[] = monoparentalRules.map((rule) => {
            const applicablePeriods = this.resolveRulePeriods(periods, rule.applicablePeriods as any[]);
            const occupancy = this.compactScope([
                `${rule.adultCount} adult(s) + ${rule.childCount} child(ren)`,
                this.ageRange(rule.minAge, rule.maxAge),
                this.roomScope(rule.applicableContractRooms),
            ]);
            return {
                key: rule.id,
                baseCells: [rule.name, occupancy],
                applicablePeriodIds: new Set(applicablePeriods.map((period) => period.id)),
                periodValues: new Map(applicablePeriods.map((period) => [
                    period.id,
                    this.monoparentalPeriodValue(rule, this.findPeriodTarget(rule.applicablePeriods as any[], period.id)),
                ])),
            };
        });

        this.drawSectionTitle(doc, index, 'Monoparental', 70);
        this.renderPeriodMatrix(doc, null, ['Rule', 'Occupancy / scope'], matrixRows, periods,
            'No monoparental clause has been appended to this agreement.');
    }

    private drawCancellationRules(doc: PDFKit.PDFDocument, { contract, cancellations }: ContractPdfGeneratorModel, index: string): void {
        const periods = this.sortedPeriods(contract.periods);
        const rows = cancellations.map((rule) => {
            const applicablePeriods = this.resolveRulePeriods(periods, rule.applicablePeriods as any[]);
            const values = applicablePeriods.map((period) => {
                const target = this.findPeriodTarget(rule.applicablePeriods as any[], period.id);
                return this.cancellationPeriodPenalty(rule, target?.overrideValue, contract.currency);
            });
            const penalty = this.valuesVary(values)
                ? applicablePeriods.map((period, index) => `${this.normalizePeriodName(period.name)}: ${values[index]}`).join('\n')
                : values[0] ?? this.cancellationPenalty(rule, contract.currency);
            const remarks = `${rule.appliesToNoShow ? 'No-show included' : 'Cancellation only'}${rule.minStayCondition ? `\nMinimum stay ${rule.minStayCondition} nights` : ''}`;

            return [
                `${rule.name}\nD-${rule.daysBeforeArrival}`,
                penalty,
                remarks,
                this.roomScope((rule as any).applicableRooms),
            ];
        });

        this.drawSectionTitle(doc, index, 'Cancellation', 70);
        this.renderRuleTable(doc, null, ['Cancellation window', 'Penalty', 'Conditions', 'Room scope'], rows,
            'Cancellation conditions are governed by the applicable operational policy.');
    }

    private drawInfoGrid(doc: PDFKit.PDFDocument, items: [string, string][], columns: number): void {
        const y = doc.y;
        const width = this.contentWidth / columns;
        const height = 38;
        items.forEach(([label, value], index) => {
            const x = this.margin + width * index;
            doc.save().rect(x, y, width, height).strokeColor(this.border).stroke().restore();
            doc.font('Helvetica-Bold').fontSize(6.3).fillColor(this.slate)
                .text(label.toUpperCase(), x + 8, y + 8, { width: width - 16, characterSpacing: 0.7 });
            doc.font('Helvetica-Bold').fontSize(8.5).fillColor(this.navy)
                .text(value, x + 8, y + 20, { width: width - 16 });
        });
        doc.y = y + height;
    }

    private drawMetaLine(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string): void {
        doc.font('Helvetica-Bold').fontSize(5.8).fillColor(this.slate)
            .text(label, x + 10, y, { width: 52, characterSpacing: 0.5 });
        doc.font('Helvetica-Bold').fontSize(7.2).fillColor(this.navy)
            .text(value, x + 62, y - 1, { width: 84, align: 'right', ellipsis: true });
        doc.moveTo(x + 10, y + 12).lineTo(x + 146, y + 12).strokeColor(this.hairline).stroke();
    }

    private drawInfoStrip(doc: PDFKit.PDFDocument, items: [string, string][]): void {
        const y = doc.y;
        const height = 31;
        const width = this.contentWidth / items.length;
        items.forEach(([label, value], index) => {
            const x = this.margin + width * index;
            doc.save().rect(x, y, width, height).fillAndStroke(index % 2 === 0 ? '#FFFFFF' : this.light, this.border).restore();
            doc.font('Helvetica-Bold').fontSize(5.8).fillColor(this.slate)
                .text(label.toUpperCase(), x + 8, y + 7, { width: width - 16, characterSpacing: 0.6 });
            doc.font('Helvetica-Bold').fontSize(7.6).fillColor(this.navy)
                .text(value, x + 8, y + 17, { width: width - 16, ellipsis: true });
        });
        doc.y = y + height;
    }

    private drawTariffNote(doc: PDFKit.PDFDocument, contract: Contract): void {
        const y = doc.y;
        doc.save().rect(this.margin, y, this.contentWidth, 24).fillAndStroke(this.light, this.border).restore();
        doc.font('Helvetica').fontSize(7.2).fillColor(this.text)
            .text(`Net contractual rates in ${contract.currency}. Amounts are per person per night unless an individual clause states otherwise.`, this.margin + 8, y + 7, {
                width: this.contentWidth - 16,
            });
        doc.y = y + 30;
    }

    private drawTariffTable(
        doc: PDFKit.PDFDocument,
        contract: Contract,
        rooms: Contract['contractRooms'],
        periods: Contract['periods'],
        lookup: Map<string, TariffRate[]>,
    ): void {
        const firstWidth = periods.length > 5 ? 88 : 104;
        const periodWidth = (this.contentWidth - firstWidth) / periods.length;
        const headerHeight = 31;

        const drawHeader = () => {
            this.ensureSpace(doc, headerHeight + 26);
            let x = this.margin;
            const y = doc.y;
            doc.save().rect(x, y, firstWidth, headerHeight).fillAndStroke(this.tableHead, this.border).restore();
            doc.font('Helvetica-Bold').fontSize(6.6).fillColor(this.navy)
                .text('ROOM TYPE', x + 6, y + 12, { width: firstWidth - 12, characterSpacing: 0.7 });
            x += firstWidth;

            periods.forEach((period) => {
                doc.save().rect(x, y, periodWidth, headerHeight).fillAndStroke(this.tableHead, this.border).restore();
                doc.font('Helvetica-Bold').fontSize(periods.length > 5 ? 5.6 : 6.5).fillColor(this.navy)
                    .text(this.normalizePeriodName(period.name).toUpperCase(), x + 5, y + 7, { width: periodWidth - 10, align: 'center', ellipsis: true });
                doc.font('Helvetica').fontSize(periods.length > 5 ? 5.1 : 5.8).fillColor(this.slate)
                    .text(this.formatDateRange(period.startDate, period.endDate), x + 5, y + 18, { width: periodWidth - 10, align: 'center' });
                x += periodWidth;
            });
            doc.y = y + headerHeight;
        };

        drawHeader();
        for (const room of rooms) {
            const cellHeights = periods.map((period) => {
                const rates = lookup.get(`${period.id}_${room.id}`) ?? [];
                return rates.length > 0 ? 10 + rates.length * 15 : 27;
            });
            const rowHeight = Math.max(32, ...cellHeights);
            if (doc.y + rowHeight > this.pageHeight - this.margin - this.footerHeight) {
                doc.addPage();
                drawHeader();
            }

            const y = doc.y;
            let x = this.margin;
            doc.save().rect(x, y, firstWidth, rowHeight).fillAndStroke('#FFFFFF', this.border).restore();
            doc.font('Helvetica-Bold').fontSize(7.2).fillColor(this.navy)
                .text(room.roomType?.name ?? 'Room', x + 6, y + 8, { width: firstWidth - 12, lineGap: 1 });
            if (this.isPublicReference(room.reference)) {
                doc.font('Helvetica').fontSize(5.8).fillColor(this.slate)
                    .text(this.publicReference(room.reference), x + 6, y + rowHeight - 12, { width: firstWidth - 12, ellipsis: true });
            }
            x += firstWidth;

            periods.forEach((period) => {
                const rates = lookup.get(`${period.id}_${room.id}`) ?? [];
                doc.save().rect(x, y, periodWidth, rowHeight).fillAndStroke('#FFFFFF', this.border).restore();
                if (rates.length === 0) {
                    doc.font('Helvetica-Oblique').fontSize(6.3).fillColor(this.slate)
                        .text('N/A', x + 6, y + 11, { width: periodWidth - 12, align: 'center' });
                } else {
                    let rateY = y + 6;
                    rates.forEach((rate, index) => {
                        doc.font('Helvetica-Bold').fontSize(periods.length > 5 ? 5.8 : 6.7).fillColor(this.text)
                            .text(`${rate.board.toUpperCase()} ${this.formatMoney(rate.amount, contract.currency)}`, x + 5, rateY, {
                                width: periodWidth - 10,
                                align: 'center',
                                ellipsis: true,
                            });
                        const terms = [
                            rate.minStay ? `min ${rate.minStay}n` : null,
                            rate.releaseDays ? `rel ${rate.releaseDays}d` : null,
                        ].filter(Boolean).join(' / ');
                        if (terms) {
                            doc.font('Helvetica').fontSize(periods.length > 5 ? 5 : 5.6).fillColor(this.slate)
                                .text(terms, x + 5, rateY + 8, { width: periodWidth - 10, align: 'center' });
                        }
                        if (index < rates.length - 1) {
                            doc.moveTo(x + 5, rateY + 13).lineTo(x + periodWidth - 5, rateY + 13).strokeColor(this.hairline).stroke();
                        }
                        rateY += 15;
                    });
                }
                x += periodWidth;
            });
            doc.y = y + rowHeight;
        }
    }

    private drawTwoCards(doc: PDFKit.PDFDocument, cards: { title: string; body: string }[], fontSize = 7.5, minHeight = 72): void {
        const gap = 14;
        const width = (this.contentWidth - gap) / 2;
        const heights = cards.map((card) => {
            doc.font('Helvetica').fontSize(fontSize);
            return Math.max(minHeight, doc.heightOfString(card.body, { width: width - 18, lineGap: 1.2 }) + 30);
        });
        const height = Math.max(...heights);
        this.ensureSpace(doc, height + 4);
        const y = doc.y;

        cards.forEach((card, index) => {
            const x = this.margin + index * (width + gap);
            doc.save().rect(x, y, width, height).strokeColor(this.border).stroke().restore();
            doc.save().rect(x, y, width, 18).fill(this.tableHead).restore();
            doc.font('Helvetica-Bold').fontSize(6.4).fillColor(this.navy)
                .text(card.title.toUpperCase(), x + 9, y + 6, { width: width - 18, characterSpacing: 0.7 });
            doc.font('Helvetica').fontSize(fontSize).fillColor(this.text)
                .text(card.body, x + 9, y + 26, { width: width - 18, lineGap: 1.2 });
        });

        doc.y = y + height;
    }

    private drawFullCard(doc: PDFKit.PDFDocument, title: string, body: string, minHeight = 62): void {
        doc.font('Helvetica').fontSize(7.4);
        const height = Math.max(minHeight, doc.heightOfString(body, { width: this.contentWidth - 18, lineGap: 1.2 }) + 30);
        this.ensureSpace(doc, height + 4);
        const y = doc.y;
        doc.save().rect(this.margin, y, this.contentWidth, height).strokeColor(this.border).stroke().restore();
        doc.save().rect(this.margin, y, this.contentWidth, 18).fill(this.tableHead).restore();
        doc.font('Helvetica-Bold').fontSize(6.4).fillColor(this.navy)
            .text(title.toUpperCase(), this.margin + 9, y + 6, { width: this.contentWidth - 18, characterSpacing: 0.7 });
        doc.font('Helvetica').fontSize(7.4).fillColor(this.text)
            .text(body, this.margin + 9, y + 26, { width: this.contentWidth - 18, lineGap: 1.2 });
        doc.y = y + height;
    }

    private drawTable(
        doc: PDFKit.PDFDocument,
        headers: string[],
        widths: number[],
        rows: TableCell[][],
        options: TableOptions = {},
    ): void {
        const fontSize = options.fontSize ?? 6.8;
        const headerFontSize = options.headerFontSize ?? 6;
        const padding = options.rowPadding ?? 4;
        const headerHeight = options.headerHeight ?? 21;

        const drawHeader = () => {
            this.ensureSpace(doc, headerHeight + 18);
            let x = this.margin;
            const y = doc.y;
            headers.forEach((header, index) => {
                const width = widths[index];
                doc.save().rect(x, y, width, headerHeight).fillAndStroke(this.tableHead, this.border).restore();
                doc.font('Helvetica-Bold').fontSize(headerFontSize).fillColor(this.navy)
                    .text(header.toUpperCase(), x + padding, y + 6, { width: width - padding * 2, lineGap: 0.6 });
                x += width;
            });
            doc.y = y + headerHeight;
        };

        drawHeader();
        for (const row of rows) {
            doc.font('Helvetica').fontSize(fontSize);
            const rowHeight = Math.max(20, ...row.map((cell, index) => {
                const text = String(cell ?? '');
                return doc.heightOfString(text, { width: widths[index] - padding * 2, lineGap: 1 }) + padding * 2;
            }));

            if (doc.y + rowHeight > this.pageHeight - this.margin - this.footerHeight) {
                doc.addPage();
                drawHeader();
            }

            let x = this.margin;
            const y = doc.y;
            row.forEach((cell, index) => {
                const width = widths[index];
                doc.save().rect(x, y, width, rowHeight).strokeColor(this.border).stroke().restore();
                doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(index === 0 ? this.navy : this.text)
                    .text(String(cell ?? ''), x + padding, y + padding, { width: width - padding * 2, lineGap: 1 });
                x += width;
            });
            doc.y = y + rowHeight;
        }
    }

    private drawSignatureCard(doc: PDFKit.PDFDocument, x: number, y: number, width: number, title: string, company: string, representative: string): void {
        const height = 92;
        doc.save().rect(x, y, width, height).strokeColor(this.border).stroke().restore();
        doc.save().rect(x, y, width, 18).fill(this.tableHead).restore();
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor(this.navy)
            .text(title.toUpperCase(), x + 10, y + 6, { width: width - 20, characterSpacing: 0.7 });
        doc.font('Helvetica-Bold').fontSize(8.4).fillColor(this.text)
            .text(company, x + 10, y + 27, { width: width - 20, lineGap: 1 });
        doc.font('Helvetica').fontSize(7.2).fillColor(this.slate)
            .text(representative, x + 10, y + 42, { width: width - 20 });
        doc.moveTo(x + 10, y + 70).lineTo(x + width - 10, y + 70).strokeColor(this.border).stroke();
        doc.font('Helvetica').fontSize(5.8).fillColor(this.slate)
            .text('SIGNATURE OF AUTHORIZED REPRESENTATIVE', x + 10, y + 76, { width: width - 20, align: 'center', characterSpacing: 0.5 });
    }

    private drawLogo(doc: PDFKit.PDFDocument, hotel: Hotel | null, x: number, y: number, size: number, logoImage: Buffer | string | null): void {
        doc.save().rect(x, y, size, size).fillAndStroke('#FFFFFF', this.border).restore();
        try {
            if (logoImage) {
                doc.image(logoImage, x + 5, y + 5, { width: size - 10, height: size - 10, fit: [size - 10, size - 10] });
                return;
            }
        } catch {
            // If a logo cannot be rendered, fall through to the printable monogram.
        }

        doc.font('Helvetica-Bold').fontSize(24).fillColor(this.navy)
            .text((hotel?.name ?? 'P').slice(0, 1).toUpperCase(), x, y + 19, { width: size, align: 'center' });
    }

    private async resolveLogoImage(logoUrl?: string | null): Promise<Buffer | string | null> {
        if (!logoUrl) return null;

        try {
            if (logoUrl.startsWith('data:image')) {
                const base64 = logoUrl.split(',')[1];
                return base64 ? Buffer.from(base64, 'base64') : null;
            }

            if (existsSync(logoUrl)) {
                return logoUrl;
            }

            if (/^https?:\/\//i.test(logoUrl)) {
                const response = await fetch(logoUrl);
                if (!response.ok) return null;
                const contentType = response.headers.get('content-type') ?? '';
                if (!contentType.startsWith('image/')) return null;
                return Buffer.from(await response.arrayBuffer());
            }
        } catch {
            return null;
        }

        return null;
    }

    private drawSectionTitle(doc: PDFKit.PDFDocument, index: string, title: string, keepWith = 0): void {
        this.ensureSpace(doc, 22 + keepWith);
        const y = doc.y;
        doc.moveTo(this.margin, y).lineTo(this.margin + this.contentWidth, y).strokeColor(this.border).stroke();
        doc.save().rect(this.margin, y + 6, 18, 14).fill(this.navy).restore();
        doc.font('Helvetica-Bold').fontSize(6.2).fillColor('#FFFFFF')
            .text(index, this.margin, y + 10, { width: 18, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(8.6).fillColor(this.navy)
            .text(title.toUpperCase(), this.margin + 26, y + 8, { characterSpacing: 1.1 });
        doc.y = y + 26;
    }

    private drawSubsectionTitle(doc: PDFKit.PDFDocument, title: string, keepWith = 0): void {
        this.ensureSpace(doc, 18 + keepWith);
        const y = doc.y;
        doc.save().rect(this.margin, y + 3, 3, 10).fill(this.mint).restore();
        doc.font('Helvetica-Bold').fontSize(6.8).fillColor(this.text)
            .text(title.toUpperCase(), this.margin + 8, y + 3, { characterSpacing: 0.7 });
        doc.y = y + 17;
    }

    private drawContinuationLabel(doc: PDFKit.PDFDocument, periods: Contract['periods']): void {
        this.ensureSpace(doc, 16);
        const first = periods[0];
        const last = periods[periods.length - 1];
        const label = first && last
            ? `Matrix continuation - ${this.normalizePeriodName(first.name)} to ${this.normalizePeriodName(last.name)}`
            : 'Matrix continuation';
        doc.font('Helvetica-Bold').fontSize(5.8).fillColor(this.slate)
            .text(label.toUpperCase(), this.margin, doc.y, {
                width: this.contentWidth,
                characterSpacing: 0.7,
            });
        doc.y += 10;
    }

    private drawEmpty(doc: PDFKit.PDFDocument, label: string): void {
        this.ensureSpace(doc, 22);
        const y = doc.y;
        doc.save().rect(this.margin, y, this.contentWidth, 19).fillAndStroke('#FFFFFF', this.border).restore();
        doc.font('Helvetica').fontSize(6.7).fillColor(this.slate).text(label, this.margin + 7, y + 6, { width: this.contentWidth - 14 });
        doc.y = y + 24;
    }

    private drawPageNumbers(doc: PDFKit.PDFDocument): void {
        const range = doc.bufferedPageRange();
        const pageCount = range.count;
        for (let i = range.start; i < range.start + range.count; i += 1) {
            doc.switchToPage(i);
            const footerRuleY = this.pageHeight - this.margin - 13;
            const footerTextY = footerRuleY + 5;
            doc.save();
            doc.moveTo(this.margin, footerRuleY).lineTo(this.pageWidth - this.margin, footerRuleY).strokeColor(this.hairline).stroke();
            doc.font('Helvetica').fontSize(6.4).fillColor(this.slate)
                .text(`Pricify Commercial Agreement | Page ${i + 1} of ${pageCount}`, this.margin, footerTextY, {
                    width: this.contentWidth,
                    align: 'center',
                    lineBreak: false,
                });
            doc.restore();
        }
    }

    private ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
        if (doc.y + height > this.pageHeight - this.margin - this.footerHeight) {
            doc.addPage();
        }
    }

    private compactAddress(hotel: Hotel | null): string {
        const parts = [hotel?.address, hotel?.phone ? `Tel. ${hotel.phone}` : null, hotel?.emails?.[0]?.address].filter(Boolean);
        return parts.length > 0 ? parts.join(' | ') : 'Commercial contact details as per agreement';
    }

    private partnerPartyText(partner: Affiliate): string {
        return [
            partner.companyName,
            partner.address ? `Address: ${partner.address}` : null,
            partner.representativeName ? `Authorized representative: ${partner.representativeName}` : 'Authorized representative: as per signed agreement',
            partner.emails?.[0]?.address ? `Commercial contact: ${partner.emails[0].address}` : null,
            partner.phone ? `Telephone: ${partner.phone}` : null,
            this.isPublicReference(partner.reference) ? `Operator reference: ${partner.reference}` : null,
        ].filter((line): line is string => Boolean(line)).join('\n');
    }

    private isPublicReference(reference?: string | null): reference is string {
        if (!reference) return false;
        return !/^[A-Z]{2,8}-\d{3,}$/i.test(reference.trim());
    }

    private publicReference(reference?: string | null): string {
        return this.isPublicReference(reference) ? reference.trim() : 'Commercial agreement';
    }

    private formatPaymentCondition(value?: string | null): string {
        if (!value) return 'Payment condition to be agreed in writing by both parties';
        if (value === 'PREPAYMENT_100') return '100% prepayment';
        if (value === 'DEPOSIT') return 'Deposit payment';
        return this.labelize(value);
    }

    private normalizePeriodName(name?: string | null): string {
        if (!name) return 'Period';
        return name.replace(/^p[ée]riode\b/i, 'Period');
    }

    private formatDate(value: Date | string | null | undefined): string {
        if (!value) return 'As agreed';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'As agreed';
        return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
    }

    private formatDateRange(start: Date | string | null | undefined, end: Date | string | null | undefined): string {
        return `${this.formatDate(start)} to ${this.formatDate(end)}`;
    }

    private formatBookingWindow(start: Date | string | null | undefined, end: Date | string | null | undefined): string {
        if (start && end) return `${this.formatDate(start)} to ${this.formatDate(end)}`;
        if (end) return `Until ${this.formatDate(end)}`;
        if (start) return `From ${this.formatDate(start)}`;
        return 'As agreed';
    }

    private formatStayWindow(start: Date | string | null | undefined, end: Date | string | null | undefined): string {
        if (!start && !end) return 'Full stay validity';
        return this.formatDateRange(start, end);
    }

    private dateSortValue(value: Date | string | null | undefined): number {
        if (!value) return Number.MAX_SAFE_INTEGER;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
    }

    private formatMoney(value: number, currency: string): string {
        const amount = Number.isFinite(value) ? value : 0;
        return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${currency}`;
    }

    private labelize(value?: string | null): string {
        if (!value) return 'As agreed';
        const compactLabels: Record<string, string> = {
            PER_NIGHT_PER_PERSON: 'Per person/night',
            PER_NIGHT_PER_ROOM: 'Per room/night',
            FLAT_RATE_PER_STAY: 'Per stay',
            FIRST_CHILD: 'First child',
            SECOND_CHILD: 'Second child',
            THIRD_CHILD: 'Third child',
            THIRD_ADULT: 'Third adult',
            SINGLE: 'SGL',
            DOUBLE: 'DBL',
            HALF_SINGLE: '1/2 SGL',
            HALF_DOUBLE: '1/2 DBL',
        };
        if (compactLabels[value]) return compactLabels[value];
        return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    private formatModifier(calculationType: string | undefined, value: number | string | null | undefined, currency: string, prefix = ''): string {
        if (value === null || value === undefined) return 'As agreed';
        if (calculationType === 'PERCENTAGE') return `${prefix}${Number(value)}%`;
        if (calculationType === 'FREE') return 'Free of charge';
        return `${prefix}${this.formatMoney(Number(value), currency)}`;
    }

    private ageRange(minAge?: number | null, maxAge?: number | null): string {
        if (minAge === null && maxAge === null) return 'All ages';
        if (minAge === undefined && maxAge === undefined) return 'All ages';
        if ((minAge ?? 0) <= 0 && (maxAge ?? 99) >= 99) return 'All ages';
        return `${minAge ?? 0}-${maxAge ?? '+'} years`;
    }

    private compactScope(parts: (string | null | undefined)[]): string {
        return parts.filter((part): part is string => Boolean(part && part.trim())).join(' | ');
    }

    private formatTargets(rooms?: any[], periods?: any[]): string {
        const roomNames = rooms?.map((item) => item.contractRoom?.roomType?.name).filter(Boolean) ?? [];
        const periodNames = periods?.map((item) => this.normalizePeriodName(item.period?.name)).filter(Boolean) ?? [];
        const roomText = roomNames.length > 0 ? roomNames.join(', ') : 'Applies to all room types';
        const periodText = periodNames.length > 0 ? periodNames.join(', ') : 'Applies to the full stay validity';
        return `${roomText}\n${periodText}`;
    }

    private sortedPeriods(periods: Contract['periods'] = []): Contract['periods'] {
        return [...(periods ?? [])].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    }

    private getPeriodId(target?: any): number | null {
        return target?.period?.id ?? target?.periodId ?? null;
    }

    private resolveRulePeriods(contractPeriods: Contract['periods'], targets?: any[]): Contract['periods'] {
        const orderedPeriods = this.sortedPeriods(contractPeriods);
        const targetIds = new Set((targets ?? [])
            .map((target) => this.getPeriodId(target))
            .filter((id): id is number => typeof id === 'number'));

        if (targetIds.size === 0) return orderedPeriods;
        return orderedPeriods.filter((period) => targetIds.has(period.id));
    }

    private findPeriodTarget(targets: any[] | undefined, periodId: number): any | undefined {
        return targets?.find((target) => this.getPeriodId(target) === periodId);
    }

    private valuesVary(values: string[]): boolean {
        return new Set(values.map((value) => value.trim())).size > 1;
    }

    private roomScope(rooms?: any[]): string {
        const roomNames = rooms?.map((item) => item.contractRoom?.roomType?.name).filter(Boolean) ?? [];
        return roomNames.length > 0 ? roomNames.join(', ') : 'All rooms';
    }

    private baseColumnWidths(totalWidth: number, columnCount: number): number[] {
        if (columnCount <= 1) return [totalWidth];
        const firstWidth = Math.min(108, totalWidth * 0.42);
        const remainingWidth = totalWidth - firstWidth;
        return [firstWidth, ...Array.from({ length: columnCount - 1 }, () => remainingWidth / (columnCount - 1))];
    }

    private supplementPeriodValue(supplement: ContractSupplement, overrideValue: number | string | null | undefined, currency: string): string {
        if (supplement.type === 'FORMULA') return supplement.formula || 'Formula applies';
        return this.formatModifier(supplement.type, overrideValue ?? supplement.value, currency);
    }

    private reductionPeriodValue(reduction: ContractReduction, overrideValue: number | string | null | undefined, currency: string): string {
        return this.formatModifier(reduction.calculationType, overrideValue ?? reduction.value, currency, '-');
    }

    private earlyBookingPeriodValue(offer: ContractEarlyBooking, overrideValue: number | string | null | undefined, currency: string): string {
        return this.formatModifier(offer.calculationType, overrideValue ?? offer.value, currency, '-');
    }

    private cleanEarlyBookingName(offer: ContractEarlyBooking, currency: string): string {
        const advantage = this.earlyBookingPeriodValue(offer, null, currency).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return offer.name.replace(new RegExp(`\\s*\\(${advantage}\\)\\s*$`, 'i'), '').trim() || offer.name;
    }

    private earlyBookingConditions(offer: ContractEarlyBooking): string {
        const conditions = [
            offer.releaseDays && offer.releaseDays > 0 ? `Release: ${offer.releaseDays} days` : null,
            offer.isPrepaid ? `Prepayment: ${offer.prepaymentPercentage ?? 0}%` : null,
        ].filter((condition): condition is string => Boolean(condition));

        return conditions.length > 0 ? conditions.join('\n') : 'Standard booking conditions';
    }

    private sortEarlyBookings(offers: ContractEarlyBooking[]): ContractEarlyBooking[] {
        return [...offers].sort((a, b) => {
            const endDiff = this.dateSortValue(a.bookingWindowEnd) - this.dateSortValue(b.bookingWindowEnd);
            if (endDiff !== 0) return endDiff;
            const startDiff = this.dateSortValue(a.bookingWindowStart) - this.dateSortValue(b.bookingWindowStart);
            if (startDiff !== 0) return startDiff;
            return a.name.localeCompare(b.name);
        });
    }

    private spoPeriodBenefit(spo: ContractSpo, overrideValue: number | string | null | undefined, currency: string): string {
        if (overrideValue === null || overrideValue === undefined) return this.spoBenefit(spo);
        if (spo.benefitType === 'PERCENTAGE_DISCOUNT') return `-${Number(overrideValue)}%`;
        if (spo.benefitType === 'FIXED_DISCOUNT') return `Fixed discount ${this.formatMoney(Number(overrideValue), currency)}`;
        if (spo.benefitType === 'FREE_NIGHTS') return `${Number(overrideValue)} free night(s)`;
        if (spo.stayNights && spo.payNights) return `Stay ${spo.stayNights} / Pay ${Number(overrideValue)}`;
        return `${this.labelize(spo.benefitType)} ${Number(overrideValue)}`;
    }

    private monoparentalPeriodValue(rule: ContractMonoparentalRule, override?: any): string {
        const baseRateType = override?.overrideBaseRateType ?? rule.baseRateType;
        const surchargeBase = override?.overrideChildSurchargeBase ?? rule.childSurchargeBase;
        const surchargeValue = override?.overrideChildSurchargeValue ?? rule.childSurchargePercentage;
        return `${this.labelize(baseRateType)} + ${surchargeValue}% ${this.labelize(surchargeBase)}`;
    }

    private cancellationPeriodPenalty(rule: ContractCancellationRule, overrideValue: number | string | null | undefined, currency: string): string {
        if (overrideValue === null || overrideValue === undefined) return this.cancellationPenalty(rule, currency);
        if (rule.penaltyType === 'PERCENTAGE') return `${Number(overrideValue)}%`;
        if (rule.penaltyType === 'FIXED_AMOUNT') return this.formatMoney(Number(overrideValue), currency);
        return `${Number(overrideValue)} night(s)`;
    }

    private spoBenefit(spo: ContractSpo): string {
        if (spo.stayNights && spo.payNights) return `Stay ${spo.stayNights} / Pay ${spo.payNights}`;
        if (spo.benefitType === 'PERCENTAGE_DISCOUNT') return `-${spo.benefitValue ?? spo.value ?? 0}%`;
        if (spo.benefitType === 'FIXED_DISCOUNT') return `Fixed discount ${spo.benefitValue ?? spo.value ?? 0}`;
        if (spo.benefitType === 'FREE_NIGHTS') return `${spo.benefitValue ?? spo.value ?? 0} free night(s)`;
        return this.labelize(spo.benefitType);
    }

    private cancellationPenalty(rule: ContractCancellationRule, currency: string): string {
        if (rule.penaltyType === 'PERCENTAGE') return `${Number(rule.baseValue)}%`;
        if (rule.penaltyType === 'FIXED_AMOUNT') return this.formatMoney(Number(rule.baseValue), currency);
        return `${Number(rule.baseValue)} night(s)`;
    }

    private numbered(items: string[]): string {
        return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
    }

    private chunk<T>(items: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let index = 0; index < items.length; index += size) {
            chunks.push(items.slice(index, index + size));
        }
        return chunks;
    }
}
