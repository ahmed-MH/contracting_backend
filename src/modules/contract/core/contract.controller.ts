import { AuthenticatedRequest } from '../../../common/interfaces/request.interface';
import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query, Req, Res } from '@nestjs/common';
import { ContractService } from './contract.service';
import { ContractPdfService } from './contract-pdf.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { CreatePeriodDto } from './dto/create-period.dto';
import { CreateContractRoomDto } from './dto/create-contract-room.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { BatchUpsertPricesDto } from './dto/batch-upsert-prices.dto';

import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/constants/enums';
import { Request, Response } from 'express';

@Controller('contracts')
@Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
export class ContractController {
    constructor(
        private readonly contractService: ContractService,
        private readonly contractPdfService: ContractPdfService,
    ) { }

    private getHotelId(req: AuthenticatedRequest): number {
        const hotelId = Number(req.headers['x-hotel-id']);
        if (!hotelId || isNaN(hotelId)) {
            throw new Error('Missing or invalid x-hotel-id header');
        }
        return hotelId;
    }

    private contentDisposition(filename: string): string {
        const asciiFallback = filename
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\x20-\x7E]/g, '')
            .replace(/["\\]/g, '')
            || 'contract.pdf';

        return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
    }

    @Post()
    createContract(@Req() req: AuthenticatedRequest, @Body() dto: CreateContractDto) {
        return this.contractService.createContract(this.getHotelId(req), dto);
    }

    @Get()
    findAll(@Req() req: AuthenticatedRequest) {
        return this.contractService.findAll(this.getHotelId(req));
    }

    @Get(':id')
    getContractDetails(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.contractService.getContractDetails(this.getHotelId(req), id);
    }

    @Get(':id/pdf')
    async downloadPdf(
        @Req() req: AuthenticatedRequest,
        @Res() res: Response,
        @Param('id', ParseIntPipe) id: number,
        @Query('partnerId') partnerId: string,
    ) {
        const hotelId = this.getHotelId(req);
        const { buffer, filename } = await this.contractPdfService.generate(hotelId, id, partnerId);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': this.contentDisposition(filename),
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }

    @Get(':id/activation-check')
    validateActivation(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.contractService.validateActivation(this.getHotelId(req), id);
    }

    @Patch(':id')
    updateContract(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateContractDto,
    ) {
        return this.contractService.updateContract(this.getHotelId(req), id, dto);
    }

    @Post(':id/periods')
    addPeriod(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreatePeriodDto,
    ) {
        return this.contractService.addPeriod(this.getHotelId(req), id, dto);
    }

    @Post(':id/rooms')
    addContractRoom(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreateContractRoomDto,
    ) {
        return this.contractService.addContractRoom(this.getHotelId(req), id, dto);
    }

    @Delete(':id/periods/:periodId')
    deletePeriod(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) id: number,
        @Param('periodId', ParseIntPipe) periodId: number,
    ) {
        return this.contractService.deletePeriod(this.getHotelId(req), id, periodId);
    }

    @Delete(':id/rooms/:roomId')
    deleteContractRoom(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) id: number,
        @Param('roomId', ParseIntPipe) roomId: number,
    ) {
        return this.contractService.deleteContractRoom(this.getHotelId(req), id, roomId);
    }

    @Get(':id/prices')
    getContractPrices(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
        return this.contractService.getContractPrices(this.getHotelId(req), id);
    }

    @Post(':id/prices/batch')
    batchUpsertPrices(
        @Req() req: AuthenticatedRequest,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: BatchUpsertPricesDto,
    ) {
        return this.contractService.batchUpsertPrices(this.getHotelId(req), id, dto);
    }
}
