import { IsInt } from 'class-validator';

export class InitContractLineDto {
    @IsInt()
    contractId: number;

    @IsInt()
    periodId: number;

    @IsInt()
    contractRoomId: number;
}
