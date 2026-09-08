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

  // ✅ En desarrollo, mostrar error. En producción, genérico
  if (env.NODE_ENV === 'development') {
    return res.status(err instanceof AppError ? err.statusCode : 500).json({
      error: err.message,
      errorId,
      stack: err.stack
    });
  }

  // Producción: error genérico
  return res.status(err instanceof AppError ? err.statusCode : 500).json({
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
