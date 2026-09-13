import winston from 'winston';
import { env } from '../env.js';
import { db } from '../db/client.js';
import { v4 as uuidv4 } from 'uuid';
import { EncryptionService } from './encryption.js';

// ✅ Winston logger configuration
export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.json(),
  defaultMeta: { service: 'fitcv-api' },
  transports: [
    new winston.transports.File({filename: 'logs/error.log', level: 'error'}),
    new winston.transports.File({filename: 'logs/combined.log'})
  ]
});

// Console logging in development
if (env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// ✅ Security event logger
export class AuditLogger {
  static logSecurityEvent(event: {
    eventType: 'LOGIN' | 'LOGOUT' | 'FAILED_LOGIN' | 'UNAUTHORIZED_ACCESS' | 'READ_CV' | 'ADMIN_QUERY' | string;
    userId?: string;
    targetUserId?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: any;
  }) {
    const id = uuidv4();
    const timestamp = new Date();
    const yearMonth = timestamp.toISOString().slice(0, 7);
    const month = timestamp.toISOString().slice(5, 7);

    // ✅ Encriptar detalles antes de guardar
    let detailsEncrypted: string | null = null;
    if (event.details) {
      detailsEncrypted = EncryptionService.encrypt(JSON.stringify(event.details));
    }

    const stmt = db.prepare(`
      INSERT INTO audit_logs (id, eventType, userId, targetUserId, ipAddress, userAgent, timestamp, detailsEncrypted, yearMonth, month)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.bind([
      id,
      event.eventType,
      event.userId || null,
      event.targetUserId || null,
      event.ipAddress || null,
      event.userAgent || null,
      new Date().toISOString(),
      detailsEncrypted,
      yearMonth,
      month
    ]);
    stmt.step();
    stmt.free();

    // ✅ Log también en Winston
    logger.warn(`SECURITY_EVENT: ${event.eventType}`, {
      userId: event.userId,
      targetUserId: event.targetUserId,
      ipAddress: event.ipAddress,
      timestamp
    });
  }

  static purgeOldLogs() {
    // ✅ Eliminar logs anteriores a 1 año
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const stmt = db.prepare('DELETE FROM audit_logs WHERE timestamp < ?');
    stmt.run(oneYearAgo);

    logger.info('Old audit logs purged');
  }
}
