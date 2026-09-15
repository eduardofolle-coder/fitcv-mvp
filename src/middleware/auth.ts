import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.js';
import { AuditLogger } from '../services/logger.js';
import { asyncHandler } from './errorHandler.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

// ✅ Middleware de autenticación
// Va envuelto en asyncHandler: al consultar el usuario en la BD puede rechazar,
// y una rejection sin capturar en middleware tumba el proceso entero.
export const requireAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
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
    await AuditLogger.logSecurityEvent({
      eventType: 'UNAUTHORIZED_ACCESS',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {path: req.path, reason: 'No token'}
    });
    return res.status(401).json({error: 'No authentication token'});
  }

  const payload = AuthService.verifyToken(token);
  // Solo el token de acceso (15 min) abre las rutas: el de renovación dura 7
  // días y, si se filtra, no debe servir como credencial de uso diario.
  if (!payload || payload.type !== 'access') {
    await AuditLogger.logSecurityEvent({
      eventType: 'UNAUTHORIZED_ACCESS',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {path: req.path, reason: 'Invalid token'}
    });
    return res.status(401).json({error: 'Invalid token'});
  }

  // ✅ Obtener usuario
  const user = await AuthService.getUserById(payload.sub);
  if (!user) {
    return res.status(401).json({error: 'User not found'});
  }

  authReq.user = {
    id: user.id,
    email: user.email
  };

  next();
});

// ✅ Middleware de autorización (role-based)
export function requireRole(..._roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({error: 'Unauthorized'});
    }

    // TODO: Implementar verificación de roles
    next();
  };
}
