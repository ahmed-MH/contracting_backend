import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import PDFDocument = require('pdfkit');
import { ProformaInvoice } from './entities/proforma-invoice.entity';

type ProformaPdfLanguage = 'fr' | 'en';

interface ProformaPdfOptions {
    language?: string;
}

interface ProformaModifier {
    name: string;
    amount: number;
}

interface ProformaDailyRate {
    date: string;
    baseRate?: number;
    netRate?: number;
    finalDailyRate?: number;
    reductionsApplied?: ProformaModifier[];
    promotionApplied?: ProformaModifier | null;
    supplementsApplied?: ProformaModifier[];
    isAvailable?: boolean;
    reason?: string;
}

interface ProformaRoomBreakdown {
    roomIndex?: number;
    roomId?: number;
    roomTypeName?: string;
    roomTotalNet?: number;
    occupantsBreakdown?: {
        adults?: number;
        children?: number;
    };
    dailyRates?: ProformaDailyRate[];
}

interface ProformaViewDailyRate {
    date: string;
    baseNightlyAmount?: number;
    grossNightlyAmount: number;
    nightlyCommercialAmount?: number;
    nightlyUnitAmount?: number;
    nightlyBasisParts?: Array<{
        type?: string;
        label?: string;
        unitAmount?: number;
        quantity?: number;
        amount?: number;
        percentageOfBase?: number | null;
        reductionPercentage?: number | null;
    }>;
    nightlyDisplayBasis?: string;
    occupancyApplied?: number;
    occupancyAdultsApplied?: number;
    occupancyChildrenApplied?: number;
    rateMode?: string;
    nightlyDiscountAmount: number;
    netNightlyAmount: number;
    commercialNightlyAmount?: number;
    displayDiscountInRow?: boolean;
    isAvailable?: boolean;
    notes?: string[];
}

interface ProformaViewRoom {
    roomIndex?: number;
    roomId?: number | null;
    roomTypeName?: string | null;
    occupancyApplied?: number;
    roomGrossAmountBeforeDiscount: number;
    roomDiscountAmount: number;
    roomNetAmountBeforeTax: number;
    discountSummary?: ProformaDiscountSource[];
    dailyRates?: ProformaViewDailyRate[];
}

interface ProformaDiscountSource {
    name?: string;
    label?: string;
    commercialLabel?: string;
    amount: number;
    scope?: 'nightly' | 'room' | 'stay' | 'global';
    displayInNightlyRows?: boolean;
    displayInSummary?: boolean;
    roomIndex?: number;
}

interface ProformaCommercialView {
    currency: string;
    nightlyLineModeLabel?: string;
    rooms?: ProformaViewRoom[];
    stayAdjustments?: ProformaModifier[];
    discountSummary?: ProformaDiscountSource[];
    totals?: {
        grossAmountBeforeDiscount?: number;
        discountAmount?: number;
        netAmountBeforeTax?: number;
        taxEnabled?: boolean;
        taxName?: string | null;
        taxAmount?: number | null;
        totalAmount?: number;
        sourceCurrency?: string;
        documentCurrency?: string;
        exchangeRateUsed?: number | null;
        fxConversionMode?: string;
        fxRateDate?: string | null;
    };
}

type LogoImage = Buffer | string | null;

const PROFORMA_DISCLAIMER =
    'This document is a commercial proforma invoice and does not constitute a legal or fiscal invoice. Prices are indicative and subject to availability at the time of confirmation.';

const DEFAULT_THEME_COLOR = '#0D9488';
const NAVY = '#0f1b2d';
const PDF_COPY: Record<ProformaPdfLanguage, Record<string, string>> = {
    en: {
        title: 'Proforma Invoice',
        number: 'No',
        issueDate: 'Issue date',
        draftPreview: 'Draft preview',
        notIssuedYet: 'Not issued yet',
        billTo: 'Bill To',
        stayDetails: 'Stay Details',
        lineModeNote: 'Nightly amounts are before stay-level discounts. Discounts are summarized below.',
        roomGrossTotal: 'Room gross total',
        roomNetTotal: 'Room net total',
        includedInSummary: 'Room total included in financial summary.',
        date: 'Date',
        nightlyRoomAmount: 'Nightly room amount',
        perAdultNight: 'per adult / night',
        perExtraAdultNight: 'per extra adult / night',
        perChildNight: 'per child / night',
        perRoomNight: 'per room / night',
        ofAdultRate: 'of adult rate',
        discountRate: 'discount',
        adults: 'adults',
        nightDiscount: 'Night discount',
        commercialRate: 'Commercial rate',
        notes: 'Notes',
        noAdjustments: 'No adjustments',
        discountSummary: 'Discount summary',
        roomDiscountSummary: 'Room discount summary',
        stayModifiers: 'Stay modifiers',
        voucherNumber: 'Voucher / reservation',
        notSpecified: 'Not specified',
        checkIn: 'Check-in',
        checkOut: 'Check-out',
        bookingDate: 'Booking date',
        nights: 'Nights',
        boardType: 'Board type',
    },
    fr: {
        title: 'Facture proforma',
        number: 'No',
        issueDate: 'Date d emission',
        draftPreview: 'Apercu brouillon',
        notIssuedYet: 'Pas encore emise',
        billTo: 'Facture a',
        stayDetails: 'Details du sejour',
        lineModeNote: 'Montants par nuit avant remises sejour. Remises resumees ci-dessous.',
        roomGrossTotal: 'Total chambre brut',
        roomNetTotal: 'Total chambre net',
        includedInSummary: 'Total chambre inclus dans le recapitulatif financier.',
        date: 'Date',
        nightlyRoomAmount: 'Montant chambre par nuit',
        perAdultNight: 'par adulte / nuit',
        perExtraAdultNight: 'par adulte supp. / nuit',
        perChildNight: 'par enfant / nuit',
        perRoomNight: 'par chambre / nuit',
        ofAdultRate: 'du tarif adulte',
        discountRate: 'remise',
        adults: 'adultes',
        nightDiscount: 'Remise nuit',
        commercialRate: 'Tarif commercial',
        notes: 'Notes',
        noAdjustments: 'Aucun ajustement',
        discountSummary: 'Resume des remises',
        roomDiscountSummary: 'Remises chambre',
        stayModifiers: 'Ajustements sejour',
        voucherNumber: 'Voucher / reservation',
        notSpecified: 'Non precise',
        checkIn: 'Arrivee',
        checkOut: 'Depart',
        bookingDate: 'Date de reservation',
        nights: 'Nuits',
        boardType: 'Pension',
    },
};

@Injectable()
export class ProformaPdfService {
    private readonly PAGE_WIDTH = 595.28;
    private readonly MARGIN = 44;
    private readonly CONTENT_WIDTH = 595.28 - 88;
    private readonly BOTTOM_MARGIN = 64;

    private readonly localeByLanguage: Record<ProformaPdfLanguage, string> = {
        en: 'en-GB',
        fr: 'fr-FR',
    };

    async generate(proforma: ProformaInvoice, options: ProformaPdfOptions = {}): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margin: this.MARGIN,
                info: {
                    Title: `Proforma Invoice ${proforma.reference}`,
                    Author: proforma.hotel?.name ?? 'Pricify',
                    Subject: 'Commercial Proforma Invoice',
                },
            });

            const chunks: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            this.resolveLogoImage(this.logoUrl(proforma))
                .then((logoImage) => {
                    this.buildDocument(doc, proforma, this.normalizeLanguage(options.language), logoImage);
                    doc.end();
                })
                .catch(reject);
        });
    }

    private buildDocument(doc: PDFKit.PDFDocument, pf: ProformaInvoice, language: ProformaPdfLanguage, logoImage: LogoImage): void {
        this.drawHeader(doc, pf, language, logoImage);
        this.drawCustomerAndStay(doc, pf, language);
        this.drawInactiveOverrideWarning(doc, pf);
        this.drawRoomingSummary(doc, pf, language);
        this.drawPricingBreakdown(doc, pf, language);
        this.drawTotals(doc, pf, language);

        if (pf.notes) {
            this.drawNotes(doc, pf.notes, this.themeColor(pf));
        }

        this.drawSignatureSection(doc, pf);
        this.drawFooter(doc);
    }

    private drawHeader(doc: PDFKit.PDFDocument, pf: ProformaInvoice, language: ProformaPdfLanguage, logoImage: LogoImage): void {
        const hotel = this.documentHotel(pf);
        const accent = this.themeColor(pf);
        const rightWidth = this.CONTENT_WIDTH * 0.34;
        const rightX = this.MARGIN + this.CONTENT_WIDTH - rightWidth;
        const logoSize = 50;
        const isIssued = this.isIssuedLike(pf);
        const leftX = this.MARGIN + logoSize + 14;
        const leftWidth = rightX - leftX - 18;
        const titleFontSize = language === 'fr' ? 22 : 25;
        const title = String(this.label(language, 'title')).toUpperCase();

        this.drawLogo(doc, pf, this.MARGIN, this.MARGIN + 2, logoSize, logoImage);

        const titleHeight = doc.font('Helvetica-Bold').fontSize(titleFontSize).heightOfString(title, {
            width: leftWidth,
            lineGap: 0.5,
        });

        doc.fontSize(titleFontSize)
            .font('Helvetica-Bold')
            .fillColor(NAVY)
            .text(title, leftX, this.MARGIN + 4, {
                width: leftWidth,
                lineGap: 0.5,
            });

        const metaY = this.MARGIN + 10 + titleHeight + 10;
        this.drawKeyValue(
            doc,
            leftX,
            metaY,
            this.label(language, 'number'),
            isIssued ? pf.reference : this.label(language, 'draftPreview'),
            leftWidth,
            10,
        );
        this.drawKeyValue(
            doc,
            leftX,
            metaY + 18,
            this.label(language, 'issueDate'),
            isIssued ? this.formatDate(this.issueDate(pf), language) : this.label(language, 'notIssuedYet'),
            leftWidth,
            8,
        );

        let hotelY = this.MARGIN + 2;
        doc.fontSize(10.5)
            .font('Helvetica-Bold')
            .fillColor(NAVY)
            .text(hotel?.name ?? 'Hotel', rightX, hotelY, {
                width: rightWidth,
                align: 'right',
            });

        hotelY = doc.y + 3;

        const hotelLines = [
            ...this.splitAddress(hotel?.address),
            hotel?.phone ? `Tel: ${hotel.phone}` : null,
            hotel?.emails?.[0]?.address ?? null,
        ].filter(Boolean) as string[];

        doc.fontSize(8)
            .font('Helvetica')
            .fillColor('#64748b');

        hotelLines.forEach((line) => {
            doc.text(line, rightX, hotelY, {
                width: rightWidth,
                align: 'right',
            });
            hotelY = doc.y + 1;
        });

        const ruleY = Math.max(metaY + 34, hotelY + 10);
        doc.moveTo(this.MARGIN, ruleY)
            .lineTo(this.PAGE_WIDTH - this.MARGIN, ruleY)
            .lineWidth(1.3)
            .strokeColor(accent)
            .stroke();
        doc.y = ruleY + 20;
    }

    private drawCustomerAndStay(doc: PDFKit.PDFDocument, pf: ProformaInvoice, language: ProformaPdfLanguage): void {
        const affiliate = this.documentAffiliate(pf);
        this.ensureSpace(doc, 116);

        const gap = 16;
        const cardWidth = (this.CONTENT_WIDTH - gap) / 2;
        const y = doc.y;
        const leftHeight = this.drawInfoCard(doc, this.MARGIN, y, cardWidth, String(this.label(language, 'billTo')).toUpperCase(), [
            { primary: true, text: pf.customerName },
            ...(pf.customerEmail ? [{ text: pf.customerEmail }] : []),
            ...this.splitAddress(affiliate?.address).map((line) => ({ text: line })),
        ]);

        const stayLines = [
            { label: this.label(language, 'checkIn'), value: this.formatDate(pf.checkIn, language) },
            { label: this.label(language, 'checkOut'), value: this.formatDate(pf.checkOut, language) },
            { label: this.label(language, 'bookingDate'), value: this.formatDate(pf.bookingDate, language) },
            { label: this.label(language, 'voucherNumber'), value: pf.voucherNumber?.trim() || this.label(language, 'notSpecified') },
            { label: this.label(language, 'nights'), value: String(this.calculateNights(pf.checkIn, pf.checkOut)) },
            { label: this.label(language, 'boardType'), value: pf.boardTypeName },
        ];
        const rightHeight = this.drawStayCard(
            doc,
            this.MARGIN + cardWidth + gap,
            y,
            cardWidth,
            String(this.label(language, 'stayDetails')).toUpperCase(),
            stayLines,
        );

        doc.y = y + Math.max(leftHeight, rightHeight) + 26;
    }

    private drawInactiveOverrideWarning(doc: PDFKit.PDFDocument, pf: ProformaInvoice): void {
        const override = this.inactiveOverride(pf);
        if (!override.enabled) {
            return;
        }

        this.ensureSpace(doc, 64);
        const y = doc.y + 8;
        const reason = override.reason ? `Reason: ${override.reason}` : 'Reason: not provided';
        const status = override.contractStatus ? `Contract status: ${override.contractStatus}` : 'Contract status: not available';

        doc.roundedRect(this.MARGIN, y, this.CONTENT_WIDTH, 52, 6)
            .fillAndStroke('#FFF7ED', '#F59E0B');
        doc.fontSize(7)
            .font('Helvetica-Bold')
            .fillColor('#92400E')
            .text('EXCEPTIONAL COMMERCIAL OVERRIDE', this.MARGIN + 12, y + 10, { characterSpacing: 1 });
        doc.fontSize(8)
            .font('Helvetica-Bold')
            .fillColor('#7C2D12')
            .text(`${status}. This proforma was generated from a non-active contract.`, this.MARGIN + 12, y + 24, {
                width: this.CONTENT_WIDTH - 24,
            });
        doc.fontSize(7.5)
            .font('Helvetica')
            .fillColor('#92400E')
            .text(reason, this.MARGIN + 12, y + 38, {
                width: this.CONTENT_WIDTH - 24,
                ellipsis: true,
            });
        doc.y = y + 62;
        this.drawSeparator(doc, '#F59E0B');
    }

    private drawRoomingSummary(doc: PDFKit.PDFDocument, pf: ProformaInvoice, language: ProformaPdfLanguage): void {
        const roomingSummary = Array.isArray(pf.roomingSummary) ? pf.roomingSummary : [];
        const accent = this.themeColor(pf);
        this.ensureSpace(doc, 72);
        doc.moveDown(0.7);
        this.drawSectionTitle(doc, 'ROOMING LIST', accent);

        if (roomingSummary.length === 0) {
            this.drawEmptyText(doc, 'No rooming data available.');
            this.drawSeparator(doc);
            return;
        }

        roomingSummary.forEach((room: any, index: number) => {
            this.ensureSpace(doc, 48);
            const y = doc.y;
            const adults = room.adults ?? 0;
            const children = room.children ?? 0;
            const ages = Array.isArray(room.childrenAges) && room.childrenAges.length > 0
                ? ` (${room.childrenAges.join(', ')} yrs)`
                : '';

            doc.roundedRect(this.MARGIN, y, this.CONTENT_WIDTH, 40, 5)
                .strokeColor('#e2e8f0')
                .lineWidth(0.7)
                .stroke();

            doc.fontSize(7)
                .font('Helvetica-Bold')
                .fillColor('#94a3b8')
                .text(room.roomName ?? `Room ${index + 1}`, this.MARGIN + 12, y + 8, { characterSpacing: 1.2 });

            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor(NAVY)
                .text(room.roomTypeName ?? 'Included in summary', this.MARGIN + 12, y + 20, {
                    width: this.CONTENT_WIDTH * 0.55,
                });

            doc.fontSize(8)
                .font('Helvetica')
                .fillColor('#64748b')
                .text(`Occupancy: ${adults} Adults${children > 0 ? `, ${children} Children${ages}` : ''}`, this.MARGIN + this.CONTENT_WIDTH * 0.6, y + 16, {
                    width: this.CONTENT_WIDTH * 0.35,
                    align: 'right',
                });

            doc.y = y + 48;
        });

        this.drawSeparator(doc);
    }

    private drawPricingBreakdown(doc: PDFKit.PDFDocument, pf: ProformaInvoice, language: ProformaPdfLanguage): void {
        const calculation = pf.calculationSnapshot ?? {};
        const proformaView = calculation.proformaView as ProformaCommercialView | undefined;
        const commercialRooms = proformaView?.rooms ?? [];
        const rooms = (calculation.roomsBreakdown ?? []) as ProformaRoomBreakdown[];
        const currency = pf.currency.toUpperCase();
        const accent = this.themeColor(pf);

        this.ensureSpace(doc, 90);
        doc.moveDown(0.7);
        this.drawSectionTitle(doc, 'DETAILED PRICING BREAKDOWN', accent);

        if (commercialRooms.length === 0 && rooms.length === 0) {
            this.drawEmptyText(doc, 'No pricing data available.');
            this.drawSeparator(doc);
            return;
        }

        if (commercialRooms.length > 0) {
            doc.fontSize(7.5)
                .font('Helvetica')
                .fillColor('#64748b')
                .text(this.label(language, 'lineModeNote'), this.MARGIN, doc.y, {
                    width: this.CONTENT_WIDTH,
                });
            doc.moveDown(0.5);

            commercialRooms.forEach((room, roomIndex) => {
                this.drawCommercialRoomBreakdown(doc, room, roomIndex, currency, language, accent);
            });

            const documentDiscounts = (proformaView?.discountSummary ?? []).filter((discount) => discount.scope !== 'room');
            this.drawDiscountSummary(doc, documentDiscounts, currency, language, accent, this.label(language, 'discountSummary'));
            this.drawStayAdjustments(doc, this.visibleStayAdjustments(proformaView?.stayAdjustments ?? [], documentDiscounts), currency, language, accent);
            doc.moveDown(0.5);
            this.drawSeparator(doc);
            return;
        }

        rooms.forEach((room, roomIndex) => {
            this.ensureSpace(doc, 100);
            const roomNumber = room.roomIndex ?? roomIndex + 1;
            const dailyRates = room.dailyRates ?? [];
            const roomTotal = typeof room.roomTotalNet === 'number'
                ? room.roomTotalNet
                : dailyRates.length > 0
                    ? dailyRates.reduce((sum, day) => sum + (day.finalDailyRate ?? 0), 0)
                    : undefined;

            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor(NAVY)
                .text(`Room ${roomNumber}`, this.MARGIN, doc.y);

            doc.fontSize(8)
                .font('Helvetica-Bold')
                .fillColor(accent)
                .text(`${this.label(language, 'roomNetTotal')}: ${this.formatCurrencyOrDash(roomTotal, currency, language)}`, this.MARGIN, doc.y, {
                    align: 'right',
                    width: this.CONTENT_WIDTH,
                });

            doc.moveDown(0.45);

            if (dailyRates.length === 0) {
                doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(this.label(language, 'includedInSummary'));
                doc.moveDown(0.5);
                return;
            }

            this.drawPricingTable(doc, dailyRates, currency, language);
            doc.moveDown(0.6);
        });

        this.drawStayAdjustments(doc, (calculation.stayModifiers ?? []) as ProformaModifier[], currency, language, accent);

        doc.moveDown(0.5);
        this.drawSeparator(doc);
    }

    private drawCommercialRoomBreakdown(
        doc: PDFKit.PDFDocument,
        room: ProformaViewRoom,
        roomIndex: number,
        currency: string,
        language: ProformaPdfLanguage,
        accent: string,
    ): void {
        this.ensureSpace(doc, 100);
        const roomNumber = room.roomIndex ?? roomIndex + 1;
        const dailyRates = room.dailyRates ?? [];

        doc.fontSize(9)
            .font('Helvetica-Bold')
            .fillColor(NAVY)
            .text(`Room ${roomNumber}${room.roomTypeName ? ` - ${room.roomTypeName}` : ''}`, this.MARGIN, doc.y);

        doc.fontSize(8)
            .font('Helvetica-Bold')
            .fillColor(accent)
                .text(`${this.label(language, 'roomGrossTotal')}: ${this.formatCurrency(room.roomGrossAmountBeforeDiscount, currency, language)}`, this.MARGIN, doc.y, {
                align: 'right',
                width: this.CONTENT_WIDTH,
            });

        doc.moveDown(0.45);

        if (dailyRates.length === 0) {
            doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(this.label(language, 'includedInSummary'));
            doc.moveDown(0.5);
            return;
        }

        this.drawCommercialPricingTable(doc, dailyRates, currency, language);
        this.drawDiscountSummary(doc, room.discountSummary ?? [], currency, language, accent, this.label(language, 'roomDiscountSummary'));
        doc.moveDown(0.6);
    }

    private drawPricingTable(
        doc: PDFKit.PDFDocument,
        dailyRates: ProformaDailyRate[],
        currency: string,
        language: ProformaPdfLanguage,
    ): void {
        const widths = [76, 76, 76, 78, this.CONTENT_WIDTH - 306];
        const x = [
            this.MARGIN,
            this.MARGIN + widths[0],
            this.MARGIN + widths[0] + widths[1],
            this.MARGIN + widths[0] + widths[1] + widths[2],
            this.MARGIN + widths[0] + widths[1] + widths[2] + widths[3],
        ];

        this.ensureSpace(doc, 24);
        const headerY = doc.y;
        doc.roundedRect(this.MARGIN, headerY, this.CONTENT_WIDTH, 18, 4).fill('#f8fafc');

        doc.fontSize(6.5)
            .font('Helvetica-Bold')
            .fillColor('#64748b');
        doc.text('Date', x[0] + 5, headerY + 6, { width: widths[0] - 8 });
        doc.text('Base Rate', x[1], headerY + 6, { width: widths[1] - 8, align: 'right' });
        doc.text('Net Rate', x[2], headerY + 6, { width: widths[2] - 8, align: 'right' });
        doc.text('Final Rate', x[3], headerY + 6, { width: widths[3] - 8, align: 'right' });
        doc.text('Notes', x[4] + 5, headerY + 6, { width: widths[4] - 8 });
        doc.y = headerY + 22;

        dailyRates.forEach((day) => {
            const notes = this.dailyRateNotes(day);
            const noteText = notes.length > 0 ? notes.join('\n') : 'No adjustments';
            const noteHeight = doc.heightOfString(noteText, { width: widths[4] - 10 });
            const rowHeight = Math.max(20, noteHeight + 10);
            this.ensureSpace(doc, rowHeight + 4);

            const y = doc.y;
            doc.save()
                .moveTo(this.MARGIN, y)
                .lineTo(this.MARGIN + this.CONTENT_WIDTH, y)
                .lineWidth(0.4)
                .strokeColor('#e2e8f0')
                .stroke()
                .restore();

            const textColor = day.isAvailable === false ? '#94a3b8' : '#334155';
            doc.fontSize(7)
                .font('Helvetica')
                .fillColor(textColor);

            doc.text(this.formatDate(day.date, language), x[0] + 5, y + 6, { width: widths[0] - 8 });
            doc.text(this.formatCurrencyOrDash(day.baseRate, currency, language), x[1], y + 6, { width: widths[1] - 8, align: 'right' });
            doc.text(this.formatCurrencyOrDash(day.netRate, currency, language), x[2], y + 6, { width: widths[2] - 8, align: 'right' });

            doc.font('Helvetica-Bold')
                .fillColor(day.isAvailable === false ? '#94a3b8' : '#0f1b2d')
                .text(this.formatCurrencyOrDash(day.finalDailyRate, currency, language), x[3], y + 6, { width: widths[3] - 8, align: 'right' });

            doc.fontSize(6.5)
                .font('Helvetica')
                .fillColor(notes.length > 0 ? '#0d9488' : '#94a3b8')
                .text(noteText, x[4] + 5, y + 6, { width: widths[4] - 10 });

            doc.y = y + rowHeight;
        });
    }

    private drawCommercialPricingTable(
        doc: PDFKit.PDFDocument,
        dailyRates: ProformaViewDailyRate[],
        currency: string,
        language: ProformaPdfLanguage,
    ): void {
        const showDiscountColumn = dailyRates.some((day) => day.displayDiscountInRow && day.nightlyDiscountAmount > 0);
        const widths = showDiscountColumn
            ? [76, 116, 86, 96, this.CONTENT_WIDTH - 374]
            : [82, 144, this.CONTENT_WIDTH - 226];
        const x = showDiscountColumn
            ? [
                this.MARGIN,
                this.MARGIN + widths[0],
                this.MARGIN + widths[0] + widths[1],
                this.MARGIN + widths[0] + widths[1] + widths[2],
                this.MARGIN + widths[0] + widths[1] + widths[2] + widths[3],
            ]
            : [
                this.MARGIN,
                this.MARGIN + widths[0],
                this.MARGIN + widths[0] + widths[1],
            ];

        this.ensureSpace(doc, 24);
        const headerY = doc.y;
        doc.roundedRect(this.MARGIN, headerY, this.CONTENT_WIDTH, 18, 4).fill('#f8fafc');

        doc.fontSize(6.2)
            .font('Helvetica-Bold')
            .fillColor('#64748b');
        doc.text(this.label(language, 'date'), x[0] + 5, headerY + 6, { width: widths[0] - 8 });
        doc.text(this.label(language, 'nightlyRoomAmount'), x[1], headerY + 6, { width: widths[1] - 8, align: 'right' });
        if (showDiscountColumn) {
            doc.text(this.label(language, 'nightDiscount'), x[2], headerY + 6, { width: widths[2] - 8, align: 'right' });
            doc.text(this.label(language, 'commercialRate'), x[3], headerY + 6, { width: widths[3] - 8, align: 'right' });
            doc.text(this.label(language, 'notes'), x[4] + 5, headerY + 6, { width: widths[4] - 8 });
        } else {
            doc.text(this.label(language, 'notes'), x[2] + 5, headerY + 6, { width: widths[2] - 8 });
        }
        doc.y = headerY + 22;

        dailyRates.forEach((day) => {
            const notes = Array.isArray(day.notes) ? day.notes.map((note) => this.modifierLabel({ name: note, amount: 0 })) : [];
            const noteText = notes.length > 0 ? notes.join('\n') : this.label(language, 'noAdjustments');
            const basisText = this.nightlyBasisText(day, currency, language);
            const noteColumnIndex = showDiscountColumn ? 4 : 2;
            const noteHeight = doc.heightOfString(noteText, { width: widths[noteColumnIndex] - 10 });
            const basisHeight = basisText ? doc.heightOfString(basisText, { width: widths[1] - 8 }) : 0;
            const rowHeight = Math.max(24, noteHeight + 10, basisHeight + 18);
            this.ensureSpace(doc, rowHeight + 4);

            const y = doc.y;
            doc.save()
                .moveTo(this.MARGIN, y)
                .lineTo(this.MARGIN + this.CONTENT_WIDTH, y)
                .lineWidth(0.4)
                .strokeColor('#e2e8f0')
                .stroke()
                .restore();

            const textColor = day.isAvailable === false ? '#94a3b8' : '#334155';
            doc.fontSize(7)
                .font('Helvetica')
                .fillColor(textColor);

            doc.text(this.formatDate(day.date, language), x[0] + 5, y + 6, { width: widths[0] - 8 });
            doc.text(this.formatCurrency(day.nightlyCommercialAmount ?? day.baseNightlyAmount ?? day.grossNightlyAmount, currency, language), x[1], y + 6, { width: widths[1] - 8, align: 'right' });
            if (basisText) {
                doc.fontSize(5.8)
                    .font('Helvetica')
                    .fillColor('#94a3b8')
                    .text(basisText, x[1], y + 16, { width: widths[1] - 8, align: 'right' });
            }
            doc.fontSize(7).font('Helvetica').fillColor(textColor);
            if (showDiscountColumn) {
                doc.text(day.displayDiscountInRow && day.nightlyDiscountAmount ? `-${this.formatCurrency(Math.abs(day.nightlyDiscountAmount), currency, language)}` : '-', x[2], y + 6, { width: widths[2] - 8, align: 'right' });
                doc.font('Helvetica-Bold')
                    .fillColor(day.isAvailable === false ? '#94a3b8' : '#0f1b2d')
                    .text(this.formatCurrency(day.netNightlyAmount, currency, language), x[3], y + 6, { width: widths[3] - 8, align: 'right' });
            }

            doc.fontSize(6.5)
                .font('Helvetica')
                .fillColor(notes.length > 0 ? '#0d9488' : '#94a3b8')
                .text(noteText, x[noteColumnIndex] + 5, y + 6, { width: widths[noteColumnIndex] - 10 });

            doc.y = y + rowHeight;
        });
    }

    private drawDiscountSummary(
        doc: PDFKit.PDFDocument,
        discounts: ProformaDiscountSource[],
        currency: string,
        language: ProformaPdfLanguage,
        accent: string,
        title = 'Discount summary',
    ): void {
        if (discounts.length === 0) return;
        this.ensureSpace(doc, 44);
        doc.fontSize(8)
            .font('Helvetica-Bold')
            .fillColor(accent)
            .text(title, this.MARGIN, doc.y);
        doc.moveDown(0.25);

        discounts.forEach((discount) => {
            this.ensureSpace(doc, 14);
            doc.fontSize(8)
                .font('Helvetica')
                .fillColor('#334155')
                .text(`${this.discountLabel(discount)}: -${this.formatCurrency(Math.abs(discount.amount), currency, language)}`, this.MARGIN + 10);
        });
        doc.moveDown(0.4);
    }

    private drawStayAdjustments(
        doc: PDFKit.PDFDocument,
        stayModifiers: ProformaModifier[],
        currency: string,
        language: ProformaPdfLanguage,
        accent: string,
    ): void {
        if (stayModifiers.length === 0) return;
        this.ensureSpace(doc, 44);
        doc.fontSize(8)
            .font('Helvetica-Bold')
            .fillColor(accent)
            .text(this.label(language, 'stayModifiers'), this.MARGIN, doc.y);
        doc.moveDown(0.25);

        stayModifiers.forEach((modifier) => {
            this.ensureSpace(doc, 14);
            doc.fontSize(8)
                .font('Helvetica')
                .fillColor('#334155')
                .text(`${modifier.name}: ${this.formatSignedCurrency(modifier.amount, currency, language)}`, this.MARGIN + 10);
        });
        doc.moveDown(0.4);
    }

    private drawTotals(doc: PDFKit.PDFDocument, pf: ProformaInvoice, language: ProformaPdfLanguage): void {
        const totals = pf.totalsSnapshot ?? {};
        const viewTotals = (pf.calculationSnapshot?.proformaView as ProformaCommercialView | undefined)?.totals;
        const currency = pf.currency.toUpperCase();
        const accent = this.themeColor(pf);
        const taxEnabled = viewTotals?.taxEnabled === true || totals.taxEnabled === true || pf.taxEnabled === true;
        const taxName = viewTotals?.taxName ?? totals.taxName ?? 'VAT / tax';
        const taxAmount = this.numberOrNull(viewTotals?.taxAmount) ?? this.numberOrNull(totals.taxAmount) ?? this.numberOrNull(pf.taxAmount) ?? 0;
        const grossAmount = this.numberOrNull(viewTotals?.grossAmountBeforeDiscount) ?? this.numberOrNull(totals.grossAmountBeforeDiscount) ?? this.numberOrNull(totals.subtotal) ?? 0;
        const netBeforeTax = this.numberOrNull(viewTotals?.netAmountBeforeTax) ?? this.numberOrNull(totals.netAmountBeforeTax) ?? this.numberOrNull(totals.netBeforeTax) ?? this.numberOrNull(totals.grandTotal) ?? 0;
        const discountAmount = this.numberOrNull(viewTotals?.discountAmount) ?? this.numberOrNull(totals.discountAmount) ?? this.numberOrNull(totals.discountTotal) ?? 0;
        const totalAmount = this.numberOrNull(viewTotals?.totalAmount) ?? this.numberOrNull(totals.totalAmount) ?? this.numberOrNull(totals.grandTotal) ?? 0;
        const fxRate = this.numberOrNull(viewTotals?.exchangeRateUsed) ?? this.numberOrNull(totals.exchangeRateUsed) ?? this.numberOrNull(totals.exchangeRate);
        const sourceCurrency = String(viewTotals?.sourceCurrency ?? totals.sourceCurrency ?? currency).toUpperCase();
        this.ensureSpace(doc, taxEnabled ? 138 : 118);
        doc.moveDown(0.8);

        const boxWidth = 260;
        const boxX = this.PAGE_WIDTH - this.MARGIN - boxWidth;
        const boxY = doc.y;
        const boxHeight = taxEnabled ? 128 : 110;

        doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 6)
            .fillAndStroke('#f8fafc', '#e2e8f0');

        let y = boxY + 13;
        this.drawTotalRow(doc, boxX, y, boxWidth, 'Gross / subtotal', this.formatCurrency(grossAmount, currency, language), '#334155');
        y += 17;
        this.drawTotalRow(doc, boxX, y, boxWidth, 'Discounts', discountAmount ? `-${this.formatCurrency(Math.abs(discountAmount), currency, language)}` : this.formatCurrency(0, currency, language), accent);
        y += 17;
        this.drawTotalRow(doc, boxX, y, boxWidth, 'Net before tax', this.formatCurrency(netBeforeTax, currency, language), '#334155');
        y += 17;
        if (taxEnabled) {
            this.drawTotalRow(doc, boxX, y, boxWidth, taxName, this.formatCurrency(taxAmount, currency, language), '#64748b');
            y += 17;
        }
        if (sourceCurrency !== currency && fxRate) {
            this.drawTotalRow(doc, boxX, y, boxWidth, 'FX rate used', `1 ${sourceCurrency} = ${fxRate} ${currency}`, '#64748b');
            y += 17;
        }
        y += 20;

        doc.moveTo(boxX + 12, y - 4)
            .lineTo(boxX + boxWidth - 12, y - 4)
            .strokeColor('#e2e8f0')
            .lineWidth(0.5)
            .stroke();

        doc.fontSize(10)
            .font('Helvetica-Bold')
            .fillColor(NAVY)
            .text('GRAND TOTAL', boxX + 12, y, { width: 105 });
        doc.fontSize(13)
            .font('Helvetica-Bold')
            .fillColor(accent)
            .text(this.formatCurrency(totalAmount, currency, language), boxX + 110, y - 1, {
                width: boxWidth - 122,
                align: 'right',
            });

        doc.y = boxY + boxHeight + 10;
    }

    private drawNotes(doc: PDFKit.PDFDocument, notes: string, accent: string): void {
        this.ensureSpace(doc, 54);
        doc.moveDown(0.5);
        this.drawSectionTitle(doc, 'COMMERCIAL NOTES', accent);
        doc.fontSize(8.5)
            .font('Helvetica')
            .fillColor('#334155')
            .text(notes, this.MARGIN, doc.y, {
                width: this.CONTENT_WIDTH,
                lineGap: 2,
            });
        doc.moveDown(0.5);
    }

    private drawSignatureSection(doc: PDFKit.PDFDocument, pf: ProformaInvoice): void {
        this.ensureSpace(doc, 118);
        doc.moveDown(0.6);
        const y = doc.y;
        const hotelName = this.documentHotel(pf)?.name ?? 'Hotel';
        const labelY = y + 22;
        const signatureY = y + 82;
        const halfWidth = (this.CONTENT_WIDTH - 20) / 2;

        doc.roundedRect(this.MARGIN, y, this.CONTENT_WIDTH, 106, 4)
            .strokeColor('#cbd5e1')
            .lineWidth(0.7)
            .stroke();

        doc.fontSize(9)
            .font('Helvetica-Bold')
            .fillColor(NAVY)
            .text(hotelName, this.MARGIN + 20, labelY, {
                width: this.CONTENT_WIDTH - 40,
            });

        doc.moveTo(this.MARGIN + 20, signatureY)
            .lineTo(this.MARGIN + 20 + halfWidth, signatureY)
            .strokeColor('#94a3b8')
            .lineWidth(0.6)
            .stroke();
        doc.moveTo(this.MARGIN + 20 + halfWidth + 20, signatureY)
            .lineTo(this.MARGIN + this.CONTENT_WIDTH - 20, signatureY)
            .strokeColor('#94a3b8')
            .lineWidth(0.6)
            .stroke();

        doc.fontSize(6.8)
            .font('Helvetica')
            .fillColor('#64748b')
            .text('LIEU ET DATE', this.MARGIN + 20, signatureY + 10, {
                width: halfWidth,
                characterSpacing: 2,
            });
        doc.text('SIGNATURE ET CACHET', this.MARGIN + 20 + halfWidth + 20, signatureY + 10, {
            width: halfWidth,
            characterSpacing: 2,
        });

        doc.y = y + 118;
    }

    private drawFooter(doc: PDFKit.PDFDocument): void {
        const footerY = doc.page.height - this.MARGIN - 40;
        if (doc.y < footerY - 10) {
            doc.y = footerY;
        }

        this.drawSeparator(doc);
        doc.moveDown(0.45);
        doc.fontSize(7)
            .font('Helvetica')
            .fillColor('#94a3b8')
            .text(PROFORMA_DISCLAIMER, this.MARGIN, doc.y, {
                align: 'center',
                width: this.CONTENT_WIDTH,
            });
    }

    private drawInfoCard(
        doc: PDFKit.PDFDocument,
        x: number,
        y: number,
        width: number,
        title: string,
        lines: { text: string; primary?: boolean }[],
    ): number {
        const height = Math.max(82, 34 + lines.length * 13);
        doc.roundedRect(x, y, width, height, 6).strokeColor('#e2e8f0').lineWidth(0.7).stroke();
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#94a3b8').text(title, x + 12, y + 11, { characterSpacing: 1.2 });

        let lineY = y + 28;
        lines.forEach((line) => {
            doc.fontSize(line.primary ? 10 : 8.5)
                .font(line.primary ? 'Helvetica-Bold' : 'Helvetica')
                .fillColor(line.primary ? '#0f1b2d' : '#64748b')
                .text(line.text, x + 12, lineY, { width: width - 24 });
            lineY += line.primary ? 15 : 12;
        });

        return height;
    }

    private drawStayCard(
        doc: PDFKit.PDFDocument,
        x: number,
        y: number,
        width: number,
        title: string,
        lines: { label: string; value: string }[],
    ): number {
        const height = 96;
        doc.roundedRect(x, y, width, height, 6).strokeColor('#e2e8f0').lineWidth(0.7).stroke();
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#94a3b8').text(title, x + 12, y + 11, { characterSpacing: 1.2 });

        lines.forEach((line, index) => {
            const col = index % 2;
            const row = Math.floor(index / 2);
            const itemX = x + 12 + col * ((width - 24) / 2);
            const itemY = y + 28 + row * 21;
            doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#94a3b8').text(line.label, itemX, itemY, { width: (width - 30) / 2 });
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f1b2d').text(line.value, itemX, itemY + 9, { width: (width - 30) / 2 });
        });

        return height;
    }

    private drawTotalRow(doc: PDFKit.PDFDocument, x: number, y: number, width: number, label: string, value: string, color: string): void {
        doc.fontSize(8.5)
            .font('Helvetica')
            .fillColor('#64748b')
            .text(label, x + 12, y, { width: 100 });
        doc.fontSize(8.5)
            .font('Helvetica-Bold')
            .fillColor(color)
            .text(value, x + 110, y, { width: width - 122, align: 'right' });
    }

    private drawSignatureCard(doc: PDFKit.PDFDocument, x: number, y: number, width: number, label: string, value: string): void {
        doc.roundedRect(x, y, width, 62, 6).strokeColor('#e2e8f0').lineWidth(0.7).stroke();
        doc.fontSize(6.5)
            .font('Helvetica-Bold')
            .fillColor('#94a3b8')
            .text(label.toUpperCase(), x + 10, y + 10, { width: width - 20, characterSpacing: 0.7 });
        doc.fontSize(8.4)
            .font('Helvetica-Bold')
            .fillColor(NAVY)
            .text(value, x + 10, y + 25, { width: width - 20, ellipsis: true });
        doc.moveTo(x + 10, y + 48).lineTo(x + width - 10, y + 48).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    }

    private drawKeyValue(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string, width: number, valueSize = 10): void {
        const labelWidth = Math.min(84, Math.max(58, width * 0.32));
        doc.fontSize(valueSize === 10 ? 8 : 7)
            .font('Helvetica-Bold')
            .fillColor('#94a3b8')
            .text(`${label}:`, x, y, { width: labelWidth });
        doc.fontSize(valueSize)
            .font('Helvetica-Bold')
            .fillColor('#0f1b2d')
            .text(value, x + labelWidth + 4, y - 1, { width: width - labelWidth - 4 });
    }

    private drawSectionTitle(doc: PDFKit.PDFDocument, title: string, color = DEFAULT_THEME_COLOR): void {
        doc.fontSize(8)
            .font('Helvetica-Bold')
            .fillColor(color)
            .text(title, this.MARGIN, doc.y, { characterSpacing: 1.4 });
        doc.moveDown(0.45);
    }

    private drawSeparator(doc: PDFKit.PDFDocument, color = '#e2e8f0'): void {
        const y = doc.y;
        doc.moveTo(this.MARGIN, y)
            .lineTo(this.PAGE_WIDTH - this.MARGIN, y)
            .lineWidth(0.5)
            .strokeColor(color)
            .stroke();
        doc.moveDown(0.2);
    }

    private drawEmptyText(doc: PDFKit.PDFDocument, text: string): void {
        doc.fontSize(8.5).font('Helvetica').fillColor('#64748b').text(text, this.MARGIN, doc.y);
        doc.moveDown(0.8);
    }

    private visibleStayAdjustments(
        modifiers: ProformaModifier[],
        discounts: ProformaDiscountSource[],
    ): ProformaModifier[] {
        const discountKeys = new Set(discounts.map((discount) => this.discountKey(this.discountLabel(discount), discount.amount)));
        return modifiers.filter((modifier) => !discountKeys.has(this.discountKey(this.modifierLabel(modifier), modifier.amount)));
    }

    private discountLabel(discount: ProformaDiscountSource): string {
        return this.modifierLabel({
            name: discount.commercialLabel ?? discount.label ?? discount.name ?? 'Discount',
            amount: discount.amount,
        });
    }

    private discountKey(label: string, amount: number): string {
        return `${label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}:${Math.abs(amount).toFixed(2)}`;
    }

    private nightlyBasisText(day: ProformaViewDailyRate, currency: string, language: ProformaPdfLanguage): string | null {
        if (Array.isArray(day.nightlyBasisParts) && day.nightlyBasisParts.length > 0) {
            const parts = day.nightlyBasisParts
                .map((part) => {
                    const unitAmount = this.numberOrNull(part.unitAmount);
                    if (unitAmount == null) return null;
                    const quantity = this.numberOrNull(part.quantity) ?? 1;
                    const percentage = this.numberOrNull(part.percentageOfBase);

                    if (part.type === 'adult') {
                        return `${this.formatCurrency(unitAmount, currency, language)} ${this.label(language, 'perAdultNight')} x ${quantity} ${this.label(language, 'adults')}`;
                    }

                    if (part.type === 'child') {
                        const percentageText = percentage != null ? ` (${percentage}% ${this.label(language, 'ofAdultRate')})` : '';
                        return `${this.formatCurrency(unitAmount, currency, language)} ${this.label(language, 'perChildNight')}${percentageText}`;
                    }

                    if (part.type === 'extra_adult') {
                        const reductionPercentage = this.numberOrNull(part.reductionPercentage);
                        const reductionText = reductionPercentage != null && reductionPercentage > 0
                            ? ` (${this.label(language, 'discountRate')} ${reductionPercentage}%)`
                            : '';
                        return `${this.formatCurrency(unitAmount, currency, language)} ${this.label(language, 'perExtraAdultNight')}${part.label ? ` ${part.label}` : ''}${reductionText}`;
                    }

                    if (part.type === 'room') {
                        return `${this.formatCurrency(unitAmount, currency, language)} ${this.label(language, 'perRoomNight')}`;
                    }

                    return `${part.label ? `${part.label}: ` : ''}${this.formatCurrency(unitAmount, currency, language)}`;
                })
                .filter(Boolean);
            return parts.length > 0 ? parts.join(' + ') : null;
        }

        const unitAmount = this.numberOrNull(day.nightlyUnitAmount);
        if (unitAmount == null) return null;

        if (day.rateMode === 'per_person' && (day.occupancyAdultsApplied ?? 0) > 0) {
            return `${this.formatCurrency(unitAmount, currency, language)} ${this.label(language, 'perAdultNight')} x ${day.occupancyAdultsApplied} ${this.label(language, 'adults')}`;
        }

        if (day.rateMode === 'per_room') {
            return `${this.formatCurrency(unitAmount, currency, language)} ${this.label(language, 'perRoomNight')}`;
        }

        return null;
    }

    private label(language: ProformaPdfLanguage, key: string): string {
        return PDF_COPY[language]?.[key] ?? PDF_COPY.en[key] ?? key;
    }

    private ensureSpace(doc: PDFKit.PDFDocument, requiredHeight: number): void {
        if (doc.y + requiredHeight > doc.page.height - this.BOTTOM_MARGIN) {
            doc.addPage();
        }
    }

    private dailyRateNotes(day: ProformaDailyRate): string[] {
        const notes: string[] = [];
        day.reductionsApplied?.forEach((modifier) => notes.push(this.modifierLabel(modifier)));
        if (day.promotionApplied) notes.push(this.modifierLabel(day.promotionApplied));
        day.supplementsApplied?.forEach((modifier) => notes.push(this.modifierLabel(modifier)));
        if (day.isAvailable === false) notes.push(`Unavailable: ${day.reason ?? 'N/A'}`);
        return notes;
    }

    private modifierLabel(modifier: ProformaModifier): string {
        return modifier.name
            .replace(/^SPO\s*\((.*)\)$/i, '$1')
            .replace(/^Early Booking\s*\((.*)\)$/i, 'Early Booking - $1')
            .replace(/^Promotion\s*\((.*)\)$/i, '$1')
            .replace(/^Adulte\s+(\d+)\s+Suppl\.?$/i, 'Adulte $1')
            .replace(/\s*\+\s*/g, '\n')
            .trim();
    }

    private splitAddress(address?: string | null): string[] {
        return (address ?? '')
            .split(/,\s*|\n+/)
            .map((part) => part.trim())
            .filter(Boolean);
    }

    private logoUrl(pf: ProformaInvoice): string | null | undefined {
        return this.documentHotel(pf)?.logoUrl ?? pf.documentLogoUrl ?? pf.hotel?.logoUrl;
    }

    private themeColor(pf: ProformaInvoice): string {
        const value = this.documentHotel(pf)?.themeColor ?? pf.documentThemeColor ?? pf.hotel?.preferredThemeColor;
        return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)
            ? value.toUpperCase()
            : DEFAULT_THEME_COLOR;
    }

    private drawLogo(doc: PDFKit.PDFDocument, pf: ProformaInvoice, x: number, y: number, size: number, logoImage: LogoImage): void {
        doc.save().roundedRect(x, y, size, size, 6).fillAndStroke('#FFFFFF', '#e2e8f0').restore();
        try {
            if (logoImage) {
                doc.image(logoImage, x + 5, y + 5, {
                    width: size - 10,
                    height: size - 10,
                    fit: [size - 10, size - 10],
                });
                return;
            }
        } catch {
            // Logo rendering is optional; keep the document printable with a monogram.
        }

        doc.font('Helvetica-Bold')
            .fontSize(22)
            .fillColor(this.themeColor(pf))
            .text((pf.hotel?.name ?? 'P').slice(0, 1).toUpperCase(), x, y + 15, {
                width: size,
                align: 'center',
            });
    }

    private async resolveLogoImage(logoUrl?: string | null): Promise<LogoImage> {
        if (!logoUrl) return null;

        try {
            if (logoUrl.startsWith('data:image')) {
                const base64 = logoUrl.split(',')[1];
                return base64 ? Buffer.from(base64, 'base64') : null;
            }

            if (existsSync(logoUrl)) {
                return logoUrl;
            }

            const localLogoPath = this.localLogoPath(logoUrl);
            if (localLogoPath) {
                return localLogoPath;
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

    private localLogoPath(logoUrl: string): string | null {
        if (/^https?:\/\//i.test(logoUrl)) return null;

        const normalized = logoUrl
            .replace(/\\/g, '/')
            .replace(/^\/+/, '')
            .replace(/^api\/+/i, '');
        if (!normalized) return null;

        const candidates = [
            join(process.cwd(), normalized),
            join(process.cwd(), 'public', normalized),
        ];

        return candidates.find((candidate) => existsSync(candidate)) ?? null;
    }

    private inactiveOverride(pf: ProformaInvoice): { enabled: boolean; contractStatus?: string; reason?: string } {
        const calculationOverride = pf.calculationSnapshot?.inactiveContractOverride;
        if (calculationOverride?.enabled) {
            return {
                enabled: true,
                contractStatus: calculationOverride.contractStatus ?? pf.calculationSnapshot?.contractStatus,
                reason: calculationOverride.reason,
            };
        }

        const context = pf.simulationInputSnapshot?.contractOverrideContext;
        if (context?.includeInactive || pf.simulationInputSnapshot?.includeInactive) {
            return {
                enabled: true,
                contractStatus: context?.contractStatus ?? pf.calculationSnapshot?.contractStatus,
                reason: context?.overrideReason ?? pf.simulationInputSnapshot?.inactiveOverrideReason,
            };
        }

        return { enabled: false };
    }

    private issueDate(pf: ProformaInvoice): Date | string {
        return (pf.issuedAt ?? pf.generatedAt) as Date | string;
    }

    private isIssuedLike(pf: ProformaInvoice): boolean {
        return pf.status === 'ISSUED' || pf.status === 'GENERATED';
    }

    private documentSnapshot(pf: ProformaInvoice): any {
        return pf.documentSnapshot ?? {};
    }

    private documentHotel(pf: ProformaInvoice): any {
        return this.documentSnapshot(pf)?.hotel ?? pf.hotel ?? null;
    }

    private documentAffiliate(pf: ProformaInvoice): any {
        return this.documentSnapshot(pf)?.affiliate ?? pf.affiliate ?? null;
    }

    private numberOrNull(value: unknown): number | null {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string' && value.trim() !== '') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    }

    private normalizeLanguage(language?: string): ProformaPdfLanguage {
        const normalized = language?.toLowerCase() ?? '';
        if (normalized.startsWith('en')) return 'en';
        return 'fr';
    }

    private locale(language: ProformaPdfLanguage): string {
        return this.localeByLanguage[language] ?? this.localeByLanguage.en;
    }

    private formatDate(date: Date | string, language: ProformaPdfLanguage): string {
        const d = new Date(date);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleDateString(this.locale(language), {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    }

    private formatCurrency(value: number, currency: string, language: ProformaPdfLanguage): string {
        return `${new Intl.NumberFormat(this.locale(language), {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value)} ${currency.toUpperCase()}`;
    }

    private formatCurrencyOrDash(value: number | undefined, currency: string, language: ProformaPdfLanguage): string {
        return typeof value === 'number' && Number.isFinite(value)
            ? this.formatCurrency(value, currency, language)
            : '-';
    }

    private formatSignedCurrency(value: number, currency: string, language: ProformaPdfLanguage): string {
        const prefix = value > 0 ? '+' : '';
        return `${prefix}${this.formatCurrency(value, currency, language)}`;
    }

    private calculateNights(checkIn: Date | string, checkOut: Date | string): number {
        const start = new Date(checkIn);
        const end = new Date(checkOut);
        return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    }
}
