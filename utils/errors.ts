export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', isOperational = true) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Invalid request payload or parameters.', code = 'BAD_REQUEST') {
    super(message, 400, code, true);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.', code = 'UNAUTHORIZED') {
    super(message, 401, code, true);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient institutional permissions for this operation.', code = 'FORBIDDEN') {
    super(message, 403, code, true);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested API resource was not found.', code = 'NOT_FOUND') {
    super(message, 404, code, true);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'The request conflicts with the current state of the target resource.', code = 'CONFLICT') {
    super(message, 409, code, true);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Request payload exceeds the maximum allowed size limit.', code = 'PAYLOAD_TOO_LARGE') {
    super(message, 413, code, true);
  }
}

export class ServiceNotConfiguredError extends AppError {
  constructor(serviceName: string) {
    super(
      `Subsystem '${serviceName}' is not configured in this milestone.`,
      503,
      'SERVICE_NOT_CONFIGURED',
      true
    );
  }
}
