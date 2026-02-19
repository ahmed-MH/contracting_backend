import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract } from './entities/contract.entity';
import { Period } from './entities/period.entity';
import { ContractRoom } from './entities/contract-room.entity';
import { Affiliate } from '../affiliate/entities/affiliate.entity';
import { RoomType } from '../hotel/entities/room-type.entity';
import { CreateContractDto } from './dto/create-contract.dto';
import { CreatePeriodDto } from './dto/create-period.dto';
import { CreateContractRoomDto } from './dto/create-contract-room.dto';
import { DateUtil } from '../../common/utils/date.util';

@Injectable()
export class ContractService {
    constructor(
        @InjectRepository(Contract)
        private readonly contractRepo: Repository<Contract>,

        @InjectRepository(Period)
        private readonly periodRepo: Repository<Period>,

        @InjectRepository(ContractRoom)
        private readonly contractRoomRepo: Repository<ContractRoom>,

        @InjectRepository(Affiliate)
        private readonly affiliateRepo: Repository<Affiliate>,

        @InjectRepository(RoomType)
        private readonly roomTypeRepo: Repository<RoomType>,
    ) { }

    // ─── Contract ─────────────────────────────────────────────────────

    async createContract(dto: CreateContractDto): Promise<Contract> {
        const start = new Date(dto.startDate);
        const end = new Date(dto.endDate);

        if (start >= end) {
            throw new BadRequestException('startDate must be strictly before endDate');
        }

        const affiliate = await this.affiliateRepo.findOne({
            where: { id: dto.affiliateId },
        });
        if (!affiliate) {
            throw new NotFoundException(`Affiliate #${dto.affiliateId} not found`);
        }

        const contract = this.contractRepo.create({
            code: dto.code,
            name: dto.name,
            startDate: start,
            endDate: end,
            currency: dto.currency,
            affiliate,
        });

        return this.contractRepo.save(contract);
    }

    async findAll(): Promise<Contract[]> {
        return this.contractRepo.find({ relations: ['affiliate'] });
    }

    async getContractDetails(id: number): Promise<Contract> {
        const contract = await this.contractRepo.findOne({
            where: { id },
            relations: ['affiliate', 'periods', 'contractRooms', 'contractRooms.roomType'],
        });

        if (!contract) {
            throw new NotFoundException(`Contract #${id} not found`);
        }

        return contract;
    }

    // ─── Period (with overlap validation) ─────────────────────────────

    async addPeriod(contractId: number, dto: CreatePeriodDto): Promise<Period> {
        const contract = await this.contractRepo.findOne({
            where: { id: contractId },
            relations: ['periods'],
        });

        if (!contract) {
            throw new NotFoundException(`Contract #${contractId} not found`);
        }

        const newStart = new Date(dto.startDate);
        const newEnd = new Date(dto.endDate);

        if (newStart >= newEnd) {
            throw new BadRequestException('startDate must be strictly before endDate');
        }

        // Validate that the period falls within the contract date range
        if (newStart < contract.startDate || newEnd > contract.endDate) {
            throw new BadRequestException(
                'Period dates must fall within the contract date range ' +
                `(${contract.startDate.toISOString()} – ${contract.endDate.toISOString()})`,
            );
        }

        // Check for overlaps with existing periods
        for (const existing of contract.periods) {
            if (DateUtil.isOverlap(newStart, newEnd, existing.startDate, existing.endDate)) {
                throw new BadRequestException(
                    `Period "${dto.name}" overlaps with existing period "${existing.name}" ` +
                    `(${existing.startDate.toISOString()} – ${existing.endDate.toISOString()})`,
                );
            }
        }

        const period = this.periodRepo.create({
            name: dto.name,
            startDate: newStart,
            endDate: newEnd,
            contract,
        });

        return this.periodRepo.save(period);
    }

    // ─── Contract Room (with duplicate guard) ─────────────────────────

    async addContractRoom(contractId: number, dto: CreateContractRoomDto): Promise<ContractRoom> {
        const contract = await this.contractRepo.findOne({
            where: { id: contractId },
            relations: ['contractRooms', 'contractRooms.roomType'],
        });

        if (!contract) {
            throw new NotFoundException(`Contract #${contractId} not found`);
        }

        const roomType = await this.roomTypeRepo.findOne({
            where: { id: dto.roomTypeId },
        });

        if (!roomType) {
            throw new NotFoundException(`RoomType #${dto.roomTypeId} not found`);
        }

        // Guard: prevent duplicate roomType mapping within the same contract
        const alreadyMapped = contract.contractRooms.some(
            (cr) => cr.roomType.id === dto.roomTypeId,
        );

        if (alreadyMapped) {
            throw new BadRequestException(
                `RoomType #${dto.roomTypeId} is already mapped to Contract #${contractId}`,
            );
        }

        const contractRoom = this.contractRoomRepo.create({
            alias: dto.alias,
            description: dto.description,
            contract,
            roomType,
        });

        return this.contractRoomRepo.save(contractRoom);
    }
}
