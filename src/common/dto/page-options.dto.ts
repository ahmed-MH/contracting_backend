import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PageOptionsDto {
    @IsInt()
    @Min(1)
    @IsOptional()
    @Type(() => Number)
    page: number = 1;

    @IsInt()
    @Min(1)
    @Max(100)
    @IsOptional()
    @Type(() => Number)
    limit: number = 10;

    @IsString()
    @IsOptional()
    search?: string;

    get skip(): number {
        return (this.page - 1) * this.limit;
    }
}
