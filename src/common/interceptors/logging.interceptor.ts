import {
    CallHandler,
    ExecutionContext,
    HttpException,
    Injectable,
    Logger,
    NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger('HTTP');

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const start = Date.now();

        const http = context.switchToHttp();
        const req = http.getRequest<Request>();
        const res = http.getResponse<Response>();

        const { method, originalUrl } = req;

        return next.handle().pipe(
            tap(() => {
                const statusCode = res.statusCode;
                const elapsed = Date.now() - start;
                const icon = statusCode >= 400 ? '❌' : '✅';

                this.logger.log(
                    `${icon} ${method} ${originalUrl} ${statusCode} - ${elapsed}ms`,
                );
            }),
            catchError((err) => {
                const statusCode = err instanceof HttpException ? err.getStatus() : 500;
                const elapsed = Date.now() - start;
                this.logger.error(`❌ ${method} ${originalUrl} ${statusCode} - ${elapsed}ms`);
                return throwError(() => err);
            }),
        );
    }
}
