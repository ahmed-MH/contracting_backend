import {
    Controller,
    Post,
    Get,
    Param,
    Body,
    Headers,
    Request,
    Res,
    ParseIntPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { ProformaService } from './proforma.service';
import { ProformaPdfService } from './proforma-pdf.service';
import { CreateProformaDto } from './dto/create-proforma.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';

@Controller('proforma')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ProformaController {
    constructor(
        private readonly proformaService: ProformaService,
        private readonly pdfService: ProformaPdfService,
    ) {}

    /**
     * Create a proforma invoice from a simulation snapshot.
     */
    @Post()
    async create(
        @Headers('x-hotel-id') hotelId: string,
        @Request() req: any,
        @Body() dto: CreateProformaDto,
    ) {
        const userId = req.user?.id ?? req.user?.sub;
        return this.proformaService.create(
            parseInt(hotelId, 10),
            userId,
            dto,
        );
    }

    /**
     * List all proformas for the current hotel.
     */
    @Get()
    async findAll(@Headers('x-hotel-id') hotelId: string) {
        return this.proformaService.findAll(parseInt(hotelId, 10));
    }

    /**
     * Get a single proforma by ID.
     */
    @Get(':id')
    async findOne(
        @Headers('x-hotel-id') hotelId: string,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.proformaService.findOne(parseInt(hotelId, 10), id);
    }

    /**
     * Download the proforma as a PDF.
     */
    @Get(':id/pdf')
    async downloadPdf(
        @Headers('x-hotel-id') hotelId: string,
        @Param('id', ParseIntPipe) id: number,
        @Res() res: Response,
    ) {
        const proforma = await this.proformaService.findOne(
            parseInt(hotelId, 10),
            id,
        );

        const pdfBuffer = await this.pdfService.generate(proforma);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${proforma.reference}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });

        res.end(pdfBuffer);
    }
}
