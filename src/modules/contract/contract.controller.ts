import { Controller, Get, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ContractService } from './contract.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { CreatePeriodDto } from './dto/create-period.dto';
import { CreateContractRoomDto } from './dto/create-contract-room.dto';

@Controller('contracts')
export class ContractController {
    constructor(private readonly contractService: ContractService) { }

    @Post()
    createContract(@Body() dto: CreateContractDto) {
        return this.contractService.createContract(dto);
    }

    @Get()
    findAll() {
        return this.contractService.findAll();
    }

    @Get(':id')
    getContractDetails(@Param('id', ParseIntPipe) id: number) {
        return this.contractService.getContractDetails(id);
    }

    // Nested route: periods belong to a specific contract
    @Post(':id/periods')
    addPeriod(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreatePeriodDto,
    ) {
        return this.contractService.addPeriod(id, dto);
    }

    // Nested route: rooms belong to a specific contract
    @Post(':id/rooms')
    addContractRoom(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreateContractRoomDto,
    ) {
        return this.contractService.addContractRoom(id, dto);
    }
}
