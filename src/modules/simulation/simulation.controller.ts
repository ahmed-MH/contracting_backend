import { Body, Controller, Get, Headers, Post, Query, Request, Res } from '@nestjs/common';
import { SimulationService } from './simulation.service';
import { SimulationRequestDto } from './dto/simulation-request.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { SimulationContractMatcherService } from './simulation-contract-matcher.service';
import { SimulationContractMatchQueryDto } from './dto/simulation-contract-match.dto';
import { RequestUser } from '../../common/interfaces/request.interface';
import { SimulationTicketPdfService } from './simulation-ticket-pdf.service';
import { Response } from 'express';

@Controller('simulation')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL, UserRole.AGENT)
export class SimulationController {
    constructor(
        private readonly simulationService: SimulationService,
        private readonly contractMatcher: SimulationContractMatcherService,
        private readonly ticketPdfService: SimulationTicketPdfService,
    ) { }

    @Get('contracts/matches')
    matchContracts(
        @Headers('x-hotel-id') hotelId: string,
        @Query() dto: SimulationContractMatchQueryDto,
        @Request() req: { user: RequestUser },
    ) {
        const includeInactive = this.canUseInactiveOverride(req.user) && Boolean(dto.includeInactive);

        return this.contractMatcher.match({
            hotelId: parseInt(hotelId, 10),
            affiliateId: dto.affiliateId,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            includeInactive,
        });
    }

    @Post('calculate')
    calculate(@Headers('x-hotel-id') hotelId: string, @Body() dto: SimulationRequestDto, @Request() req: { user: RequestUser }) {
        return this.simulationService.calculate(parseInt(hotelId, 10), dto, req.user);
    }

    @Post('ticket')
    async downloadTicket(
        @Headers('x-hotel-id') hotelId: string,
        @Body() dto: SimulationRequestDto,
        @Request() req: { user: RequestUser },
        @Res() res: Response,
    ) {
        const parsedHotelId = parseInt(hotelId, 10);
        const result = await this.simulationService.calculate(parsedHotelId, dto, req.user);
        const { buffer, filename } = await this.ticketPdfService.generate(parsedHotelId, dto, result, req.user);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': this.contentDisposition(filename),
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }

    private canUseInactiveOverride(user: RequestUser): boolean {
        return user.role === UserRole.ADMIN || user.role === UserRole.COMMERCIAL;
    }

    private contentDisposition(filename: string): string {
        const asciiFallback = filename
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\x20-\x7E]/g, '')
            .replace(/["\\]/g, '')
            || 'simulation-ticket.pdf';

        return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
    }
}
