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
  // stdout siempre activo: en Render (y cualquier PaaS) los archivos son efímeros
  // y los logs solo llegan si se escriben al proceso.
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
  ]
});


// ✅ Security event logger
export class AuditLogger {
  static async logSecurityEvent(event: {
    eventType: 'LOGIN' | 'LOGOUT' | 'FAILED_LOGIN' | 'UNAUTHORIZED_ACCESS' | 'READ_CV' | 'ADMIN_QUERY' | string;
    userId?: string;
    targetUserId?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: any;
  }): Promise<void> {
    const id = uuidv4();
    const timestamp = new Date();
    const yearMonth = timestamp.toISOString().slice(0, 7);
    const month = timestamp.toISOString().slice(5, 7);

    // ✅ Encriptar detalles antes de guardar
    let detailsEncrypted: string | null = null;
    if (event.details) {
      detailsEncrypted = EncryptionService.encrypt(JSON.stringify(event.details));
    }

    await db.query(`
      INSERT INTO audit_logs (id, eventType, userId, targetUserId, ipAddress, userAgent, timestamp, detailsEncrypted, yearMonth, month)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
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

    // ✅ Log también en Winston
    logger.warn(`SECURITY_EVENT: ${event.eventType}`, {
      userId: event.userId,
      targetUserId: event.targetUserId,
      ipAddress: event.ipAddress,
      timestamp
    });
  }

  static async purgeOldLogs(): Promise<void> {
    // ✅ Eliminar logs anteriores a 1 año
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    await db.query('DELETE FROM audit_logs WHERE timestamp < $1', [oneYearAgo]);

    logger.info('Old audit logs purged');
  }
}
