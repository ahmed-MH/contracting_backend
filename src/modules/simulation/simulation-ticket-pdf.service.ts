import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument = require('pdfkit');
import { Repository } from 'typeorm';
import { RequestUser } from '../../common/interfaces/request.interface';
import { Affiliate } from '../affiliate/entities/affiliate.entity';
import { Contract } from '../contract/core/entities/contract.entity';
import { Arrangement } from '../hotel/entities/arrangement.entity';
import { Hotel } from '../hotel/entities/hotel.entity';
import { SimulationRequestDto } from './dto/simulation-request.dto';
import { SimulationResponseDto } from './dto/simulation-response.dto';

interface TicketContext {
    hotel: Hotel | null;
    affiliate: Affiliate;
    contract: Contract;
    arrangements: Arrangement[];
    request: SimulationRequestDto;
    result: SimulationResponseDto;
    generatedBy?: RequestUser;
}

@Injectable()
export class SimulationTicketPdfService {
    constructor(
        @InjectRepository(Hotel)
        private readonly hotelRepo: Repository<Hotel>,
        @InjectRepository(Affiliate)
        private readonly affiliateRepo: Repository<Affiliate>,
        @InjectRepository(Contract)
        private readonly contractRepo: Repository<Contract>,
        @InjectRepository(Arrangement)
        private readonly arrangementRepo: Repository<Arrangement>,
    ) {}

    async generate(
        hotelId: number,
        request: SimulationRequestDto,
        result: SimulationResponseDto,
        generatedBy?: RequestUser,
    ): Promise<{ buffer: Buffer; filename: string }> {
        const [hotel, affiliate, contract, arrangements] = await Promise.all([
            this.hotelRepo.findOne({ where: { id: hotelId } }),
            this.affiliateRepo.findOne({ where: { id: request.affiliateId, hotelId } }),
            this.contractRepo.findOne({
                where: { id: request.contractId, hotelId },
                relations: ['contractRooms', 'contractRooms.roomType', 'baseArrangement'],
            }),
            this.arrangementRepo.find({ where: { hotelId }, order: { level: 'ASC', name: 'ASC' } }),
        ]);

        if (!affiliate) {
            throw new BadRequestException(`Affiliate #${request.affiliateId} not found in hotel #${hotelId}.`);
        }
        if (!contract) {
            throw new NotFoundException(`Contract #${request.contractId} not found in hotel #${hotelId}.`);
        }

        const buffer = await this.buildPdf({ hotel, affiliate, contract, arrangements, request, result, generatedBy });
        const filename = `simulation-ticket-${this.slugFilename(affiliate.companyName, 'partner')}-${request.checkIn}-${request.checkOut}.pdf`;

        return { buffer, filename };
    }

    private buildPdf(ctx: TicketContext): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            const doc = new PDFDocument({
                size: 'A4',
                margin: 42,
                info: {
                    Title: 'Simulation ticket',
                    Author: ctx.generatedBy?.email ?? 'Mariott contracting',
                    Subject: 'Internal simulation ticket',
                },
            });

            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            this.drawDocument(doc, ctx);
            doc.end();
        });
    }

    private drawDocument(doc: PDFKit.PDFDocument, ctx: TicketContext): void {
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const left = doc.page.margins.left;
        const top = doc.page.margins.top;
        const accent = '#0f766e';
        const ink = '#111827';
        const muted = '#6b7280';

        doc.rect(left, top, width, 76).fill('#f8fafc');
        doc.fillColor(ink).font('Helvetica-Bold').fontSize(22).text('Simulation ticket', left + 18, top + 17);
        doc.font('Helvetica').fontSize(9).fillColor(muted).text('Internal pricing ticket - not a proforma invoice', left + 18, top + 47);
        doc.roundedRect(left + width - 120, top + 20, 98, 24, 4).strokeColor(accent).lineWidth(1).stroke();
        doc.fillColor(accent).font('Helvetica-Bold').fontSize(8.5).text('AGENT COPY', left + width - 101, top + 28);

        const generatedAt = new Date();
        const nights = this.nightsBetween(ctx.request.checkIn, ctx.request.checkOut);
        const generatedBy = [ctx.generatedBy?.firstName, ctx.generatedBy?.lastName].filter(Boolean).join(' ')
            || ctx.generatedBy?.email
            || 'Agent';

        let y = top + 102;
        this.drawInfoGrid(doc, y, [
            ['Hotel', ctx.hotel?.name ?? `Hotel #${ctx.contract.hotelId}`],
            ['Partner', ctx.affiliate.companyName],
            ['Stay', `${this.formatDate(ctx.request.checkIn)} to ${this.formatDate(ctx.request.checkOut)}`],
            ['Nights', String(nights)],
            ['Contract', ctx.contract.reference ? `${ctx.contract.reference} - ${ctx.contract.name}` : ctx.contract.name],
            ['Generated by', generatedBy],
            ['Booking date', this.formatDate(ctx.request.bookingDate ?? new Date())],
            ['Generated at', generatedAt.toLocaleString('fr-FR')],
        ]);

        y += 144;
        doc.moveTo(left, y).lineTo(left + width, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
        y += 22;

        doc.fillColor(ink).font('Helvetica-Bold').fontSize(12).text('Rooming summary', left, y);
        y += 24;
        y = this.drawRoomTable(doc, ctx, y);

        y += 18;
        this.ensureSpace(doc, 112);
        y = Math.max(y, doc.y);
        doc.roundedRect(left, y, width, 86, 6).fillAndStroke('#ecfdf5', '#99f6e4');
        doc.fillColor(accent).font('Helvetica-Bold').fontSize(9).text('FINAL NET TOTAL', left + 18, y + 17);
        doc.fillColor(ink).font('Helvetica-Bold').fontSize(25).text(
            this.formatCurrency(ctx.result.totalNet, ctx.result.currency),
            left + 18,
            y + 35,
        );
        const totalsX = left + width - 190;
        doc.font('Helvetica-Bold').fontSize(8).fillColor(muted).text('GROSS', totalsX, y + 28, { width: 64 });
        doc.font('Helvetica-Bold').fontSize(8).fillColor(muted).text('DISCOUNTS', totalsX, y + 49, { width: 64 });
        doc.font('Helvetica').fontSize(9).fillColor(ink).text(this.formatCurrency(ctx.result.totalBrut, ctx.result.currency), totalsX + 78, y + 27, {
            width: 100,
            align: 'right',
        });
        doc.font('Helvetica').fontSize(9).fillColor(ink).text(this.formatCurrency(ctx.result.totalRemise, ctx.result.currency), totalsX + 78, y + 48, {
            width: 100,
            align: 'right',
        });

        this.drawFooter(doc);
    }

    private drawInfoGrid(doc: PDFKit.PDFDocument, y: number, items: [string, string][]): void {
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const colWidth = width / 2;
        const rowHeight = 34;

        items.forEach(([label, value], index) => {
            const col = index % 2;
            const row = Math.floor(index / 2);
            const x = left + col * colWidth;
            const itemY = y + row * rowHeight;

            doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(7).text(label.toUpperCase(), x, itemY);
            doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9).text(value || '-', x, itemY + 11, {
                width: colWidth - 18,
                ellipsis: true,
            });
        });
    }

    private drawRoomTable(doc: PDFKit.PDFDocument, ctx: TicketContext, y: number): number {
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const columns = [
            { label: '#', width: 26 },
            { label: 'Room', width: 128 },
            { label: 'Board', width: 112 },
            { label: 'Adults', width: 48 },
            { label: 'Children ages', width: 96 },
            { label: 'Net total', width: width - 410 },
        ];

        doc.rect(left, y, width, 24).fill('#111827');
        let x = left;
        columns.forEach((column) => {
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7).text(column.label.toUpperCase(), x + 6, y + 8, {
                width: column.width - 12,
                align: column.label === 'Net total' ? 'right' : 'left',
            });
            x += column.width;
        });

        y += 24;
        ctx.request.roomingList.forEach((room, index) => {
            this.ensureSpace(doc, 34);
            if (doc.y > y) y = doc.y;

            const roomType = ctx.contract.contractRooms?.find((contractRoom) => contractRoom.roomType?.id === room.roomId)?.roomType;
            const board = ctx.arrangements.find((arrangement) => arrangement.id === room.boardTypeId);
            const adults = room.occupants.filter((occupant) => occupant.type === 'ADULT').length;
            const childAges = room.occupants
                .filter((occupant) => occupant.type !== 'ADULT')
                .map((occupant) => occupant.age)
                .join(', ');
            const roomBreakdown = this.findRoomBreakdown(ctx.result.roomsBreakdown, index);
            const roomTotal = roomBreakdown?.roomTotalNet;
            const values = [
                String(index + 1),
                roomType?.name ?? `Room #${room.roomId}`,
                board ? `${board.name} (${board.code})` : `Board #${room.boardTypeId}`,
                String(adults),
                childAges || '-',
                roomTotal === undefined ? '-' : this.formatCurrency(roomTotal, ctx.result.currency),
            ];

            doc.rect(left, y, width, 30).fill(index % 2 === 0 ? '#ffffff' : '#f8fafc');
            x = left;
            columns.forEach((column, columnIndex) => {
                doc.fillColor('#111827').font('Helvetica').fontSize(8).text(values[columnIndex], x + 6, y + 10, {
                    width: column.width - 12,
                    align: column.label === 'Net total' ? 'right' : 'left',
                    ellipsis: true,
                });
                x += column.width;
            });
            doc.moveTo(left, y + 30).lineTo(left + width, y + 30).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
            y += 30;
        });

        return y;
    }

    private findRoomBreakdown(
        breakdowns: SimulationResponseDto['roomsBreakdown'],
        zeroBasedIndex: number,
    ): SimulationResponseDto['roomsBreakdown'][number] | undefined {
        return breakdowns.find((breakdown) => breakdown.roomIndex === zeroBasedIndex + 1)
            ?? breakdowns.find((breakdown) => breakdown.roomIndex === zeroBasedIndex)
            ?? breakdowns[zeroBasedIndex];
    }

    private drawFooter(doc: PDFKit.PDFDocument): void {
        const left = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const y = doc.page.height - doc.page.margins.bottom - 28;

        doc.moveTo(left, y).lineTo(left + width, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
        doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(
            'This document is an internal simulation ticket for operational sharing. It is not a proforma invoice and has no accounting value.',
            left,
            y + 10,
            { width, align: 'center' },
        );
    }

    private ensureSpace(doc: PDFKit.PDFDocument, requiredHeight: number): void {
        if (doc.y + requiredHeight > doc.page.height - doc.page.margins.bottom - 44) {
            doc.addPage();
            doc.y = doc.page.margins.top;
        }
    }

    private nightsBetween(checkIn: string, checkOut: string): number {
        const start = new Date(`${checkIn}T00:00:00`);
        const end = new Date(`${checkOut}T00:00:00`);
        return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    }

    private formatDate(value: string | Date): string {
        return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    private formatCurrency(value: number, currency: string): string {
        const amount = new Intl.NumberFormat('fr-FR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);

        return `${amount.replace(/[\s\u00a0\u202f]/g, ' ')} ${currency}`;
    }

    private safeFilename(value?: string | null, fallback = 'ticket'): string {
        return (value || fallback)
            .trim()
            .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/[. ]+$/g, '') || fallback;
    }

    private slugFilename(value?: string | null, fallback = 'ticket'): string {
        return this.safeFilename(value, fallback)
            .toLowerCase()
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-+|-+$/g, '') || fallback;
    }
}
