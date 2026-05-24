import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Port of com.husrevity.common.ApiException.
 * Use these factory methods in services instead of throwing raw Error.
 * GlobalExceptionFilter maps them to the ResponseWrapper envelope.
 */
export class ApiException extends HttpException {
  constructor(message: string, status: HttpStatus) {
    super({ message, status }, status);
  }

  static badRequest(message: string): ApiException {
    return new ApiException(message, HttpStatus.BAD_REQUEST);
  }

  static unauthorized(message: string): ApiException {
    return new ApiException(message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(message: string): ApiException {
    return new ApiException(message, HttpStatus.FORBIDDEN);
  }

  static notFound(message: string): ApiException {
    return new ApiException(message, HttpStatus.NOT_FOUND);
  }

  static conflict(message: string): ApiException {
    return new ApiException(message, HttpStatus.CONFLICT);
  }
}
