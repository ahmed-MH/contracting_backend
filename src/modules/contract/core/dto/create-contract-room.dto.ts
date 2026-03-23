import { IsString, IsInt, IsOptional } from 'class-validator';

export class CreateContractRoomDto {
    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsInt()
    contractId: number;

    @IsInt()
    roomTypeId: number;
}
