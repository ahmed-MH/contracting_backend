import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractStatus } from '../../common/constants/enums';
import { Contract } from '../contract/core/entities/contract.entity';
import {
    SimulationContractCandidateDto,
    SimulationContractMatchResponseDto,
} from './dto/simulation-contract-match.dto';

export const DEFAULT_SIMULATION_CONTRACT_STATUSES = [ContractStatus.ACTIVE];
export const INACTIVE_SIMULATION_CONTRACT_STATUSES = [
    ContractStatus.ACTIVE,
    ContractStatus.EXPIRED,
    ContractStatus.TERMINATED,
];

export interface SimulationContractMatchInput {
    hotelId: number;
    affiliateId: number;
    checkIn: string;
    checkOut: string;
    includeInactive?: boolean;
    allowedStatuses?: ContractStatus[];
}

@Injectable()
export class SimulationContractMatcherService {
    constructor(
        @InjectRepository(Contract)
        private readonly contractRepo: Repository<Contract>,
    ) {}

    async match(input: SimulationContractMatchInput): Promise<SimulationContractMatchResponseDto> {
        const hotelId = Number(input.hotelId);
        const affiliateId = Number(input.affiliateId);
        const checkIn = this.toLocalDate(input.checkIn);
        const checkOut = this.toLocalDate(input.checkOut);
        const allowedStatuses = input.allowedStatuses?.length
            ? input.allowedStatuses
            : input.includeInactive
                ? INACTIVE_SIMULATION_CONTRACT_STATUSES
                : DEFAULT_SIMULATION_CONTRACT_STATUSES;

        if (!Number.isFinite(hotelId) || hotelId <= 0) {
            throw new BadRequestException('A valid hotel id is required for simulation contract matching.');
        }
        if (!Number.isFinite(affiliateId) || affiliateId <= 0) {
            throw new BadRequestException('A valid affiliateId is required for simulation contract matching.');
        }
        if (!checkIn || !checkOut) {
            throw new BadRequestException('Valid check-in and check-out dates are required for simulation contract matching.');
        }
        if (checkIn >= checkOut) {
            throw new BadRequestException('Check-out date must be after check-in date.');
        }

        const contracts = await this.contractRepo.find({
            where: allowedStatuses.map((status) => ({ hotelId, status })),
            relations: ['affiliates', 'baseArrangement'],
            order: { startDate: 'ASC', endDate: 'ASC', id: 'ASC' },
        });

        const candidates = contracts
            .filter((contract) => allowedStatuses.includes(contract.status))
            .filter((contract) => this.hasAffiliate(contract, affiliateId))
            .filter((contract) => this.fullyCoversStay(contract, checkIn, checkOut))
            .map((contract) => this.toCandidate(contract, affiliateId));

        if (candidates.length === 0) {
            return {
                status: 'none',
                candidates: [],
                reason: input.includeInactive
                    ? 'No allowed contract fully covers the selected stay for this partner.'
                    : 'No active contract fully covers the selected stay for this partner.',
            };
        }

        if (candidates.length === 1) {
            return {
                status: 'single',
                candidates,
                autoSelectedContractId: candidates[0].contractId,
            };
        }

        return {
            status: 'multiple',
            candidates,
            reason: input.includeInactive
                ? 'Multiple allowed contracts cover the selected stay for this partner. Select one manually.'
                : 'Multiple active contracts cover the selected stay for this partner. Select one manually.',
        };
    }

    async assertContractMatches(input: SimulationContractMatchInput & { contractId: number }): Promise<void> {
        const result = await this.match(input);
        const matchingContract = result.candidates.find((candidate) => candidate.contractId === Number(input.contractId));

        if (!matchingContract) {
            throw new BadRequestException(
                `Contract #${input.contractId} is not valid for affiliate #${input.affiliateId} and the selected stay dates.`,
            );
        }
    }

    private hasAffiliate(contract: Contract, affiliateId: number): boolean {
        return (contract.affiliates ?? []).some((affiliate) => affiliate.id === affiliateId);
    }

    private fullyCoversStay(contract: Contract, checkIn: Date, checkOut: Date): boolean {
        const contractStart = this.toLocalDate(contract.startDate);
        const contractEnd = this.toLocalDate(contract.endDate);
        if (!contractStart || !contractEnd) return false;

        const lastStayNight = new Date(checkOut);
        lastStayNight.setDate(lastStayNight.getDate() - 1);

        return contractStart <= checkIn && contractEnd >= lastStayNight;
    }

    private toCandidate(contract: Contract, affiliateId: number): SimulationContractCandidateDto {
        const affiliate = (contract.affiliates ?? []).find((item) => item.id === affiliateId);

        return {
            contractId: contract.id,
            reference: contract.reference,
            name: contract.name,
            status: contract.status,
            startDate: this.isoDate(contract.startDate),
            endDate: this.isoDate(contract.endDate),
            currency: contract.currency,
            baseArrangement: contract.baseArrangement
                ? {
                    id: contract.baseArrangement.id,
                    name: contract.baseArrangement.name,
                    code: contract.baseArrangement.code,
                }
                : null,
            affiliate: affiliate
                ? {
                    id: affiliate.id,
                    companyName: affiliate.companyName,
                }
                : null,
        };
    }

    private toLocalDate(value?: Date | string | null): Date | null {
        if (!value) return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0);
    }

    private isoDate(value?: Date | string | null): string {
        const date = this.toLocalDate(value) ?? new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}
