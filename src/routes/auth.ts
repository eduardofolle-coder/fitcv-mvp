import { Router } from 'express';
import { AuthService } from '../services/auth.js';
import { AuditLogger } from '../services/logger.js';
import { validateRequest, schemas } from '../middleware/validation.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import rateLimit from 'express-rate-limit';

const router = Router();

// ✅ Rate limiting: máximo 5 intentos de login por 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again later'
});

// POST /api/auth/register
router.post(
  '/register',
  loginLimiter,
  validateRequest(schemas.register),
  asyncHandler(async (req: any, res: any) => {
    const { email, password } = req.body;

    // ✅ Verificar que email no exista
    const existingUser = AuthService.getUserByEmail(email);
    if (existingUser) {
      AuditLogger.logSecurityEvent({
        eventType: 'FAILED_LOGIN',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: {reason: 'Email already registered'}
      });
      throw new AppError(400, 'Email already in use');
    }

    // ✅ Crear usuario
    const user = await AuthService.createUser(email, password);
    const { accessToken, refreshToken, expiresIn } = AuthService.generateTokens(user.id);

    // ✅ Guardar refresh token
    await AuthService.storeRefreshToken(
      user.id,
      refreshToken,
      req.ip || 'unknown',
      req.get('User-Agent') || 'unknown'
    );

    // ✅ Log
    AuditLogger.logSecurityEvent({
      eventType: 'LOGIN',
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // ✅ Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      success: true,
      data: {
        accessToken,
        expiresIn,
        userId: user.id,
        email: user.email
      }
    });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
  validateRequest(schemas.login),
  asyncHandler(async (req: any, res: any) => {
    const { email, password } = req.body;

    // ✅ Buscar usuario
    const user = AuthService.getUserByEmail(email);
    if (!user) {
      AuditLogger.logSecurityEvent({
        eventType: 'FAILED_LOGIN',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: {email}
      });
      throw new AppError(401, 'Invalid credentials');
    }

    // ✅ Verificar contraseña
    const isValid = await AuthService.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      AuditLogger.logSecurityEvent({
        eventType: 'FAILED_LOGIN',
        userId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      throw new AppError(401, 'Invalid credentials');
    }

    // ✅ Generar tokens
    const { accessToken, refreshToken, expiresIn } = AuthService.generateTokens(user.id);

    // ✅ Guardar refresh token
    await AuthService.storeRefreshToken(
      user.id,
      refreshToken,
      req.ip || 'unknown',
      req.get('User-Agent') || 'unknown'
    );

    AuditLogger.logSecurityEvent({
      eventType: 'LOGIN',
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // ✅ httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      data: {
        accessToken,
        expiresIn,
        userId: user.id,
        email: user.email
      }
    });
  })
);

// POST /api/auth/refresh
router.post(
  '/refresh',
  asyncHandler(async (req: any, res: any) => {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      throw new AppError(401, 'No refresh token');
    }

    // ✅ Obtener userId del token
    const payload = AuthService.verifyToken(refreshToken);
    if (!payload) {
      throw new AppError(401, 'Invalid refresh token');
    }

    // ✅ Validar que refresh token existe en BD
    const isValid = await AuthService.validateRefreshToken(
      payload.sub,
      refreshToken,
      req.ip || 'unknown'
    );
    if (!isValid) {
      throw new AppError(401, 'Refresh token not found or expired');
    }

    // ✅ Generar nuevos tokens
    const { accessToken, refreshToken: newRefreshToken, expiresIn } = AuthService.generateTokens(payload.sub);

    // ✅ Guardar nuevo refresh token
    await AuthService.storeRefreshToken(
      payload.sub,
      newRefreshToken,
      req.ip || 'unknown',
      req.get('User-Agent') || 'unknown'
    );

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({accessToken, expiresIn});
  })
);

// POST /api/auth/logout
router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    if (!req.user) throw new AppError(401, 'Unauthorized');

    // ✅ Invalidar todos los refresh tokens
    AuthService.invalidateRefreshTokens(req.user.id);

    AuditLogger.logSecurityEvent({
      eventType: 'LOGOUT',
      userId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.clearCookie('refreshToken');
    res.json({message: 'Logged out successfully'});
  })
);

export default router;
