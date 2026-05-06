import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { ContractStatus } from '../../../common/constants/enums';

export type SimulationContractMatchStatus = 'none' | 'single' | 'multiple';

export class SimulationContractMatchQueryDto {
    @Type(() => Number)
    @IsNumber()
    @IsNotEmpty()
    affiliateId: number;

    @IsDateString()
    @IsNotEmpty()
    checkIn: string;

    @IsDateString()
    @IsNotEmpty()
    checkOut: string;

    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true')
    @IsBoolean()
    includeInactive?: boolean;
}

export interface SimulationContractCandidateDto {
    contractId: number;
    reference?: string | null;
    name: string;
    status: ContractStatus;
    startDate: string;
    endDate: string;
    currency: string;
    baseArrangement?: {
        id: number;
        name: string;
        code: string;
    } | null;
    affiliate?: {
        id: number;
        companyName: string;
    } | null;
}

export interface SimulationContractMatchResponseDto {
    status: SimulationContractMatchStatus;
    candidates: SimulationContractCandidateDto[];
    autoSelectedContractId?: number;
    reason?: string;
}
