import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';

/**
 * Global exception filter that returns a consistent error response format:
 *
 * {
 *   "statusCode": 400,
 *   "error": "Bad Request",
 *   "message": "Validation failed",
 *   "details": [...],
 *   "timestamp": "2026-03-07T...",
 *   "path": "/api/issues"
 * }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  private static readonly STATUS_NAMES: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: any[] | null = null;
    let errorName = 'Internal Server Error';

    if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      message = 'Too many requests. Please try again later.';
      errorName = 'Too Many Requests';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as any;
        if (Array.isArray(resp.message)) {
          // Validation pipe errors
          details = resp.message;
          message = 'Validation failed';
        } else {
          message = resp.message || resp.error || message;
        }
      }

      errorName =
        HttpExceptionFilter.STATUS_NAMES[status] ||
        exception.name ||
        'Error';
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(
        `Unhandled error: ${exception.message}`,
        exception.stack,
      );
    }

    const errorResponse: Record<string, any> = {
      statusCode: status,
      error: errorName,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (details) {
      errorResponse.details = details;
    }

    response.status(status).json(errorResponse);
  }
}
