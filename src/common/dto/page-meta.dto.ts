export class PageMetaDto {
    readonly total: number;
    readonly page: number;
    readonly limit: number;
    readonly lastPage: number;

    constructor(total: number, page: number, limit: number) {
        this.total = total;
        this.page = page;
        this.limit = limit;
        this.lastPage = Math.ceil(total / limit) || 1;
    }
}
