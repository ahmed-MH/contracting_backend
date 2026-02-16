import { IsString, IsNotEmpty, IsInt, IsOptional } from 'class-validator';

export class CreateContractRoomDto {
    @IsString()
    @IsNotEmpty()
    alias: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsInt()
    contractId: number;

    @IsInt()
    roomTypeId: number;
}
