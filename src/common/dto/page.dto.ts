import { PageMetaDto } from './page-meta.dto';

export class PageDto<T> {
    readonly data: T[];
    readonly meta: PageMetaDto;

    constructor(data: T[], total: number, page: number, limit: number) {
        this.data = data;
        this.meta = new PageMetaDto(total, page, limit);
    }
}
