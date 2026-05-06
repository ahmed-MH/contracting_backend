import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { AuthenticatedRequest as Request, AuthenticatedResponse as Response } from '../interfaces/request.interface';

/**
 * Global HTTP exception filter that normalizes error responses
 * into a consistent JSON structure for all API consumers.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        const error = exception as { code?: string; message?: string; stack?: string };
        const isHttpException = exception instanceof HttpException;
        const isMulterSizeError = error?.code === 'LIMIT_FILE_SIZE';
        const status = isHttpException
            ? exception.getStatus()
            : isMulterSizeError
                ? HttpStatus.BAD_REQUEST
                : HttpStatus.INTERNAL_SERVER_ERROR;
        const exceptionResponse = isMulterSizeError
            ? { message: 'The uploaded file is too large' }
            : isHttpException
                ? exception.getResponse()
                : { message: error?.message ?? 'Internal server error' };

        const errorPayload =
            typeof exceptionResponse === 'string'
                ? { message: exceptionResponse }
                : (exceptionResponse as Record<string, unknown>);

        const body = {
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            method: request.method,
            ...errorPayload,
        };

        this.logger.error(
            `${request.method} ${request.url} -> ${status}`,
            error?.stack,
        );

        response.status(status).json(body);
    }
}
