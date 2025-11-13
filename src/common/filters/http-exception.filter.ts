import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, errors } = this.extractExceptionInfo(exception);

    this.logger.error(
      `${request.method} ${request.url} - Status: ${status} - Message: ${message}`,
      exception instanceof Error ? exception.stack : '',
    );

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: Array.isArray(message) ? message : [message],
      ...(errors !== null && { errors }),
      // Inclui stack apenas em desenvolvimento
      ...(process.env.NODE_ENV === 'development' &&
        exception instanceof Error && { stack: exception.stack }),
    };

    response.status(status).json(errorResponse);
  }

  private extractExceptionInfo(exception: unknown): {
    status: number;
    message: string | string[];
    errors: unknown;
  } {
    // Caso 1: HttpException do NestJS
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const { message, errors } =
        this.parseExceptionResponse(exceptionResponse);
      return { status, message, errors };
    }

    // Caso 2: Error genérico
    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: exception.message,
        errors: null,
      };
    }

    // Caso 3: Exceção desconhecida
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor',
      errors: null,
    };
  }

  private parseExceptionResponse(exceptionResponse: string | object): {
    message: string | string[];
    errors: unknown;
  } {
    // Se for string, retorna diretamente
    if (typeof exceptionResponse === 'string') {
      return { message: exceptionResponse, errors: null };
    }

    // Se for objeto, extrai message e errors
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const responseObject = exceptionResponse as Record<string, unknown>;
      const message = this.extractMessage(responseObject);
      const errors =
        'errors' in responseObject ? (responseObject.errors ?? null) : null;
      return { message, errors };
    }

    return { message: 'Erro interno do servidor', errors: null };
  }

  private extractMessage(
    responseObject: Record<string, unknown>,
  ): string | string[] {
    if (!('message' in responseObject)) {
      return 'Erro interno do servidor';
    }

    const responseMessage = responseObject.message;

    if (Array.isArray(responseMessage)) {
      return responseMessage;
    }

    if (typeof responseMessage === 'string') {
      return responseMessage;
    }

    return 'Erro interno do servidor';
  }
}
