import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { ProformaInvoice } from './entities/proforma-invoice.entity';

/**
 * Builds a professional A4 Proforma Invoice PDF using PDFKit.
 * All data comes from frozen snapshots — never recalculated.
 */
@Injectable()
export class ProformaPdfService {
    private readonly PAGE_WIDTH = 595.28; // A4
    private readonly MARGIN = 50;
    private readonly CONTENT_WIDTH = 595.28 - 100;

    /**
     * Generate a PDF buffer from a ProformaInvoice entity.
     */
    async generate(proforma: ProformaInvoice): Promise<Buffer> {
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

            this.buildDocument(doc, proforma);
            doc.end();
        });
    }

    private buildDocument(doc: PDFKit.PDFDocument, pf: ProformaInvoice): void {
        const hotel = pf.hotel;
        const totals = pf.totalsSnapshot ?? {};
        const calculation = pf.calculationSnapshot ?? {};
        const roomingSummary = pf.roomingSummary ?? [];

        // ─── HEADER ─────────────────────────────────────────────────
        this.drawHeader(doc, hotel, pf);

        // ─── CUSTOMER BLOCK ─────────────────────────────────────────
        this.drawCustomerBlock(doc, pf);

        // ─── STAY DETAILS ───────────────────────────────────────────
        this.drawStayDetails(doc, pf);

        // ─── ROOMING SUMMARY ────────────────────────────────────────
        this.drawRoomingSummary(doc, roomingSummary);

        // ─── PRICING BREAKDOWN ──────────────────────────────────────
        this.drawPricingBreakdown(doc, calculation, pf.currency);

        // ─── TOTALS ─────────────────────────────────────────────────
        this.drawTotals(doc, totals, pf.currency);

        // ─── NOTES ──────────────────────────────────────────────────
        if (pf.notes) {
            this.drawNotes(doc, pf.notes);
        }

        // ─── FOOTER ─────────────────────────────────────────────────
        this.drawFooter(doc, pf);
    }

    // ─── HEADER ──────────────────────────────────────────────────────

    private drawHeader(doc: PDFKit.PDFDocument, hotel: any, pf: ProformaInvoice): void {
        // Hotel name
        doc.fontSize(18)
            .font('Helvetica-Bold')
            .fillColor('#0f1b2d')
            .text(hotel?.name ?? 'Hotel', this.MARGIN, this.MARGIN);

        // Hotel details
        doc.fontSize(8)
            .font('Helvetica')
            .fillColor('#64748b');

        let y = doc.y + 4;
        if (hotel?.address) {
            doc.text(hotel.address, this.MARGIN, y);
            y = doc.y;
        }
        if (hotel?.phone) {
            doc.text(`Tel: ${hotel.phone}`, this.MARGIN, y);
            y = doc.y;
        }
        if (hotel?.emails?.[0]?.address) {
            doc.text(hotel.emails[0].address, this.MARGIN, y);
            y = doc.y;
        }

        // Title + Reference — right aligned
        const rightX = this.PAGE_WIDTH - this.MARGIN;

        doc.fontSize(20)
            .font('Helvetica-Bold')
            .fillColor('#0d9488')
            .text('PROFORMA INVOICE', this.MARGIN, this.MARGIN, {
                align: 'right',
                width: this.CONTENT_WIDTH,
            });

        doc.fontSize(10)
            .font('Helvetica-Bold')
            .fillColor('#0f1b2d')
            .text(pf.reference, this.MARGIN, doc.y + 4, {
                align: 'right',
                width: this.CONTENT_WIDTH,
            });

        doc.fontSize(8)
            .font('Helvetica')
            .fillColor('#64748b')
            .text(`Date: ${this.formatDate(pf.generatedAt)}`, this.MARGIN, doc.y + 2, {
                align: 'right',
                width: this.CONTENT_WIDTH,
            });

        // Separator
        doc.moveDown(1.5);
        this.drawSeparator(doc);
    }

    // ─── CUSTOMER BLOCK ──────────────────────────────────────────────

    private drawCustomerBlock(doc: PDFKit.PDFDocument, pf: ProformaInvoice): void {
        doc.moveDown(0.8);
        this.drawSectionTitle(doc, 'CUSTOMER / AFFILIATE');

        doc.fontSize(10)
            .font('Helvetica-Bold')
            .fillColor('#0f1b2d')
            .text(pf.customerName);

        if (pf.customerEmail) {
            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#64748b')
                .text(pf.customerEmail);
        }

        if (pf.affiliate?.address) {
            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#64748b')
                .text(pf.affiliate.address);
        }

        doc.moveDown(0.8);
        this.drawSeparator(doc);
    }

    // ─── STAY DETAILS ────────────────────────────────────────────────

    private drawStayDetails(doc: PDFKit.PDFDocument, pf: ProformaInvoice): void {
        doc.moveDown(0.8);
        this.drawSectionTitle(doc, 'STAY DETAILS');

        const details = [
            ['Check-in', this.formatDate(pf.checkIn)],
            ['Check-out', this.formatDate(pf.checkOut)],
            ['Board Type', pf.boardTypeName],
            ['Booking Date', this.formatDate(pf.bookingDate)],
            ['Nights', String(this.calculateNights(pf.checkIn, pf.checkOut))],
        ];

        const colWidth = this.CONTENT_WIDTH / 3;
        const startY = doc.y;
        let currentX = this.MARGIN;
        let maxY = startY;

        details.forEach(([label, value], i) => {
            const row = Math.floor(i / 3);
            const col = i % 3;
            const x = this.MARGIN + col * colWidth;
            const y = startY + row * 30;

            doc.fontSize(7)
                .font('Helvetica')
                .fillColor('#94a3b8')
                .text(label, x, y);

            doc.fontSize(10)
                .font('Helvetica-Bold')
                .fillColor('#0f1b2d')
                .text(value, x, y + 10);

            maxY = Math.max(maxY, y + 22);
        });

        doc.y = maxY;
        doc.moveDown(0.8);
        this.drawSeparator(doc);
    }

    // ─── ROOMING SUMMARY ─────────────────────────────────────────────

    private drawRoomingSummary(doc: PDFKit.PDFDocument, roomingSummary: any[]): void {
        doc.moveDown(0.8);
        this.drawSectionTitle(doc, 'ROOMING LIST');

        if (!Array.isArray(roomingSummary) || roomingSummary.length === 0) {
            doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('No rooming data available.');
            doc.moveDown(0.8);
            this.drawSeparator(doc);
            return;
        }

        roomingSummary.forEach((room: any, idx: number) => {
            const roomLabel = room.roomName || room.roomTypeName || `Room ${idx + 1}`;
            const adults = room.adults ?? 0;
            const children = room.children ?? 0;

            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor('#0f1b2d')
                .text(`${idx + 1}. ${roomLabel}`, this.MARGIN, doc.y);

            doc.fontSize(8)
                .font('Helvetica')
                .fillColor('#64748b')
                .text(`   ${adults} adult(s), ${children} child(ren)`, this.MARGIN + 15);

            if (Array.isArray(room.childrenAges) && room.childrenAges.length > 0) {
                doc.fontSize(7)
                    .font('Helvetica')
                    .fillColor('#94a3b8')
                    .text(`   Ages: ${room.childrenAges.join(', ')}`, this.MARGIN + 15);
            }

            doc.moveDown(0.3);
        });

        doc.moveDown(0.5);
        this.drawSeparator(doc);
    }

    // ─── PRICING BREAKDOWN ───────────────────────────────────────────

    private drawPricingBreakdown(doc: PDFKit.PDFDocument, calculation: any, currency: string): void {
        doc.moveDown(0.8);
        this.drawSectionTitle(doc, 'PRICING BREAKDOWN');

        const rooms = calculation?.roomsBreakdown ?? [];

        if (rooms.length === 0) {
            doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('No pricing data available.');
            doc.moveDown(0.8);
            this.drawSeparator(doc);
            return;
        }

        rooms.forEach((room: any, roomIdx: number) => {
            this.checkPageBreak(doc, 80);

            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor('#0f1b2d')
                .text(`Room ${room.roomIndex ?? roomIdx + 1}`, this.MARGIN, doc.y);

            doc.fontSize(8)
                .font('Helvetica')
                .fillColor('#0d9488')
                .text(`Room total: ${this.formatCurrency(room.roomTotalNet, currency)}`, this.MARGIN, doc.y, {
                    align: 'right',
                    width: this.CONTENT_WIDTH,
                });

            doc.moveDown(0.3);

            // Draw table header
            const tableY = doc.y;
            const colWidths = [100, 80, 80, 80, this.CONTENT_WIDTH - 340];

            doc.fontSize(7)
                .font('Helvetica-Bold')
                .fillColor('#94a3b8');

            doc.text('Date', this.MARGIN, tableY);
            doc.text('Base Rate', this.MARGIN + colWidths[0], tableY);
            doc.text('Net Rate', this.MARGIN + colWidths[0] + colWidths[1], tableY);
            doc.text('Final Rate', this.MARGIN + colWidths[0] + colWidths[1] + colWidths[2], tableY);
            doc.text('Notes', this.MARGIN + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], tableY);

            doc.moveDown(0.3);

            // Draw daily rates
            const dailyRates = room.dailyRates ?? [];
            dailyRates.forEach((day: any) => {
                this.checkPageBreak(doc, 14);

                const rowY = doc.y;
                doc.fontSize(7)
                    .font('Helvetica')
                    .fillColor(day.isAvailable === false ? '#94a3b8' : '#334155');

                doc.text(this.formatShortDate(day.date), this.MARGIN, rowY);
                doc.text(this.formatCurrency(day.baseRate, currency), this.MARGIN + colWidths[0], rowY);
                doc.text(this.formatCurrency(day.netRate, currency), this.MARGIN + colWidths[0] + colWidths[1], rowY);
                doc.text(this.formatCurrency(day.finalDailyRate, currency), this.MARGIN + colWidths[0] + colWidths[1] + colWidths[2], rowY);

                const notes: string[] = [];
                if (day.promotionApplied) notes.push(day.promotionApplied.name);
                if (!day.isAvailable) notes.push(day.reason ?? 'N/A');

                if (notes.length > 0) {
                    doc.fontSize(6)
                        .fillColor('#0d9488')
                        .text(notes.join('; '), this.MARGIN + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], rowY, {
                            width: colWidths[4],
                        });
                }

                doc.moveDown(0.15);
            });

            doc.moveDown(0.5);
        });

        // Stay modifiers
        const stayModifiers = calculation?.stayModifiers ?? [];
        if (stayModifiers.length > 0) {
            this.checkPageBreak(doc, 40);

            doc.fontSize(8)
                .font('Helvetica-Bold')
                .fillColor('#0d9488')
                .text('Stay Modifiers:', this.MARGIN, doc.y);
            doc.moveDown(0.2);

            stayModifiers.forEach((mod: any) => {
                const prefix = mod.amount < 0 ? '' : '+';
                doc.fontSize(8)
                    .font('Helvetica')
                    .fillColor('#334155')
                    .text(`• ${mod.name}: ${prefix}${this.formatCurrency(mod.amount, currency)}`, this.MARGIN + 10);
            });
        }

        doc.moveDown(0.5);
        this.drawSeparator(doc);
    }

    // ─── TOTALS ──────────────────────────────────────────────────────

    private drawTotals(doc: PDFKit.PDFDocument, totals: any, currency: string): void {
        this.checkPageBreak(doc, 80);
        doc.moveDown(0.8);

        // Totals box background
        const boxY = doc.y;
        const boxHeight = 70;
        doc.save()
            .roundedRect(this.MARGIN, boxY, this.CONTENT_WIDTH, boxHeight, 6)
            .fill('#f0fdfa');
        doc.restore();

        const rightCol = this.PAGE_WIDTH - this.MARGIN - 10;
        let y = boxY + 12;

        // Subtotal
        doc.fontSize(9)
            .font('Helvetica')
            .fillColor('#334155')
            .text('Subtotal', this.MARGIN + 15, y);
        doc.text(this.formatCurrency(totals.subtotal ?? 0, currency), this.MARGIN + 15, y, {
            align: 'right',
            width: this.CONTENT_WIDTH - 30,
        });

        y += 16;

        // Discount
        if (totals.discountTotal && totals.discountTotal > 0) {
            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#0d9488')
                .text('Discounts', this.MARGIN + 15, y);
            doc.text(`-${this.formatCurrency(totals.discountTotal, currency)}`, this.MARGIN + 15, y, {
                align: 'right',
                width: this.CONTENT_WIDTH - 30,
            });
            y += 16;
        }

        // Grand Total
        doc.fontSize(13)
            .font('Helvetica-Bold')
            .fillColor('#0f1b2d')
            .text('GRAND TOTAL', this.MARGIN + 15, y);
        doc.text(this.formatCurrency(totals.grandTotal ?? 0, currency), this.MARGIN + 15, y, {
            align: 'right',
            width: this.CONTENT_WIDTH - 30,
        });

        doc.y = boxY + boxHeight + 10;
    }

    // ─── NOTES ───────────────────────────────────────────────────────

    private drawNotes(doc: PDFKit.PDFDocument, notes: string): void {
        this.checkPageBreak(doc, 50);
        doc.moveDown(0.5);
        this.drawSectionTitle(doc, 'NOTES');

        doc.fontSize(9)
            .font('Helvetica')
            .fillColor('#334155')
            .text(notes, this.MARGIN, doc.y, {
                width: this.CONTENT_WIDTH,
            });

        doc.moveDown(0.5);
    }

    // ─── FOOTER ──────────────────────────────────────────────────────

    private drawFooter(doc: PDFKit.PDFDocument, pf: ProformaInvoice): void {
        // Position footer near bottom
        const footerY = doc.page.height - this.MARGIN - 40;
        if (doc.y < footerY - 10) {
            doc.y = footerY;
        }

        this.drawSeparator(doc);
        doc.moveDown(0.5);

        doc.fontSize(7)
            .font('Helvetica')
            .fillColor('#94a3b8')
            .text(
                'This is a commercial proforma invoice — not a legal or tax document.',
                this.MARGIN,
                doc.y,
                { align: 'center', width: this.CONTENT_WIDTH },
            );

        doc.fontSize(7)
            .text(
                `Generated on ${this.formatDate(pf.generatedAt)} via Pricify`,
                this.MARGIN,
                doc.y + 2,
                { align: 'center', width: this.CONTENT_WIDTH },
            );
    }

    // ─── HELPERS ─────────────────────────────────────────────────────

    private drawSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
        doc.fontSize(8)
            .font('Helvetica-Bold')
            .fillColor('#0d9488')
            .text(title, this.MARGIN, doc.y);
        doc.moveDown(0.4);
    }

    private drawSeparator(doc: PDFKit.PDFDocument): void {
        const y = doc.y;
        doc.save()
            .moveTo(this.MARGIN, y)
            .lineTo(this.PAGE_WIDTH - this.MARGIN, y)
            .lineWidth(0.5)
            .strokeColor('#e2e8f0')
            .stroke();
        doc.restore();
        doc.moveDown(0.2);
    }

    private checkPageBreak(doc: PDFKit.PDFDocument, requiredHeight: number): void {
        if (doc.y + requiredHeight > doc.page.height - this.MARGIN - 50) {
            doc.addPage();
        }
    }

    private formatDate(date: Date | string): string {
        const d = new Date(date);
        return d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    }

    private formatShortDate(date: string): string {
        const d = new Date(date);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    }

    private formatCurrency(value: number, currency: string): string {
        return `${new Intl.NumberFormat('fr-FR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value)} ${currency}`;
    }

    private calculateNights(checkIn: Date | string, checkOut: Date | string): number {
        const start = new Date(checkIn);
        const end = new Date(checkOut);
        return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    }
}
