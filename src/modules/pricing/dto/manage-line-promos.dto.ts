import { IsInt, IsArray, ArrayMinSize } from 'class-validator';

export class ManageLinePromosDto {
    @IsInt()
    contractLineId: number;

    @IsArray()
    @ArrayMinSize(1, { message: 'At least one promotion ID is required' })
    @IsInt({ each: true })
    promotionIds: number[];
}
