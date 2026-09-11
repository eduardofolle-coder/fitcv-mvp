import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.js';
import { AuditLogger } from '../services/logger.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

// ✅ Middleware de autenticación
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  let token: string | undefined;

  // Check multiple token sources
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  if (!token) {
    console.error('❌ No token found in request');
    console.error('  Headers:', Object.keys(req.headers));
    console.error('  Authorization header:', authHeader);
    AuditLogger.logSecurityEvent({
      eventType: 'UNAUTHORIZED_ACCESS',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {path: req.path, reason: 'No token'}
    });
    return res.status(401).json({error: 'No authentication token'});
  }

  const payload = AuthService.verifyToken(token);
  if (!payload) {
    AuditLogger.logSecurityEvent({
      eventType: 'UNAUTHORIZED_ACCESS',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {path: req.path, reason: 'Invalid token'}
    });
    return res.status(401).json({error: 'Invalid token'});
  }

  // ✅ Obtener usuario
  const user = AuthService.getUserById(payload.sub);
  if (!user) {
    return res.status(401).json({error: 'User not found'});
  }

  req.user = {
    id: user.id,
    email: user.email
  };

  next();
}

// ✅ Middleware de autorización (role-based)
export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({error: 'Unauthorized'});
    }

    // TODO: Implementar verificación de roles
    next();
  };
}
