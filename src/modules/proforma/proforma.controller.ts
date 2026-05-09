import {
    Controller,
    Post,
    Get,
    Param,
    Query,
    Body,
    Headers,
    Res,
    ParseIntPipe,
    Patch,
    Delete,
} from '@nestjs/common';
import { Response } from 'express';
import { ProformaService } from './proforma.service';
import { CreateProformaDto } from './dto/create-proforma.dto';
import { ListIssuedProformasDto } from './dto/list-issued-proformas.dto';
import { UpdateProformaPreviewSettingsDto } from './dto/update-proforma-preview-settings.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request.interface';

@Controller('proforma')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ProformaController {
    constructor(private readonly proformaService: ProformaService) {}

    /**
     * Create a proforma invoice from a simulation snapshot.
     */
    @Post()
    async create(
        @Headers('x-hotel-id') hotelId: string,
        @CurrentUser() user: RequestUser,
        @Body() dto: CreateProformaDto,
    ) {
        return this.proformaService.create(
            parseInt(hotelId, 10),
            user,
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

    @Get('invoices')
    async findIssuedInvoices(
        @Headers('x-hotel-id') hotelId: string,
        @Query() filters: ListIssuedProformasDto,
    ) {
        return this.proformaService.findIssuedInvoices(parseInt(hotelId, 10), filters);
    }

    @Get('invoices/archived')
    async findArchivedIssuedInvoices(
        @Headers('x-hotel-id') hotelId: string,
        @Query() filters: ListIssuedProformasDto,
    ) {
        return this.proformaService.findArchivedIssuedInvoices(parseInt(hotelId, 10), filters);
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
     * Recalculate the saved preview document after finalization settings change.
     */
    @Patch(':id/preview-settings')
    async updatePreviewSettings(
        @Headers('x-hotel-id') hotelId: string,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateProformaPreviewSettingsDto,
        @CurrentUser() user?: RequestUser,
    ) {
        return this.proformaService.updatePreviewSettings(parseInt(hotelId, 10), id, dto, user);
    }

    @Delete(':id')
    async archive(
        @Headers('x-hotel-id') hotelId: string,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.proformaService.archive(parseInt(hotelId, 10), id);
    }

    @Patch(':id/restore')
    async restore(
        @Headers('x-hotel-id') hotelId: string,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.proformaService.restore(parseInt(hotelId, 10), id);
    }

    @Post(':id/download')
    async issueAndDownload(
        @Headers('x-hotel-id') hotelId: string,
        @Param('id', ParseIntPipe) id: number,
        @Query('language') language: string | undefined,
        @CurrentUser() user: RequestUser,
        @Res() res: Response,
    ) {
        const result = await this.proformaService.downloadPdf(
            parseInt(hotelId, 10),
            id,
            language,
            user,
        );

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${result.filename}"`,
            'Content-Length': result.buffer.length,
            'X-Proforma-Reference': result.proforma.reference,
            'X-Proforma-Status': result.proforma.status,
            'X-Proforma-Issued-Now': result.issuedNow ? '1' : '0',
            'X-Proforma-Id': String(result.proforma.id),
        });

        res.end(result.buffer);
    }

    @Get(':id/pdf')
    async downloadIssuedPdf(
        @Headers('x-hotel-id') hotelId: string,
        @Param('id', ParseIntPipe) id: number,
        @Query('language') language: string | undefined,
        @Res() res: Response,
    ) {
        const result = await this.proformaService.downloadIssuedPdf(
            parseInt(hotelId, 10),
            id,
            language,
        );

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${result.filename}"`,
            'Content-Length': result.buffer.length,
            'X-Proforma-Reference': result.proforma.reference,
            'X-Proforma-Status': result.proforma.status,
            'X-Proforma-Issued-Now': '0',
            'X-Proforma-Id': String(result.proforma.id),
        });

        res.end(result.buffer);
    }
}
