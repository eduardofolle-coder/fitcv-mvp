import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.js';
import { env } from '../env.js';
import { v4 as uuidv4 } from 'uuid';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
  }
}

// ✅ Error handler middleware
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const errorId = uuidv4();

  // ✅ Log error completo internamente
  logger.error('Unhandled error', {
    errorId,
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    statusCode: err instanceof AppError ? err.statusCode : 500
  });

  const statusCode = err instanceof AppError ? err.statusCode : 500;

  // ✅ En desarrollo, mostrar error completo
  if (env.NODE_ENV === 'development') {
    return res.status(statusCode).json({
      error: err.message,
      errorId,
      stack: err.stack
    });
  }

  // Producción: los errores de cliente (4xx) son intencionales y deben llegar
  // al usuario ("Email already in use"). Solo los 5xx se ocultan.
  if (err instanceof AppError && statusCode < 500) {
    return res.status(statusCode).json({
      error: err.message,
      errorId
    });
  }

  return res.status(statusCode).json({
    error: 'Internal server error',
    errorId
  });
}

// ✅ Async error wrapper
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
