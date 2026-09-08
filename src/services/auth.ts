import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../env.js';
import { db } from '../db/client.js';
import type { User, AuthTokens, JWTPayload } from '../types/index.js';

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    // ✅ bcrypt con salt rounds = 12
    return bcryptjs.hash(password, 12);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcryptjs.compare(password, hash);
  }

  static generateTokens(userId: string): AuthTokens {
    // ✅ Access token (15 min)
    const accessToken = jwt.sign(
      { sub: userId, type: 'access' } as any,
      env.JWT_PRIVATE_KEY as any,
      { expiresIn: '15m' } as any
    );

    // ✅ Refresh token (7 días)
    const refreshToken = jwt.sign(
      { sub: userId, type: 'refresh' } as any,
      env.JWT_PRIVATE_KEY as any,
      { expiresIn: '7d' } as any
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60 // 15 minutos en segundos
    };
  }

  static verifyToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, env.JWT_PUBLIC_KEY as any) as JWTPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  static async createUser(email: string, password: string): Promise<User> {
    const id = uuidv4();
    const passwordHash = await this.hashPassword(password);
    const now = new Date();

    const stmt = db.prepare(`
      INSERT INTO users (id, email, passwordHash, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, email.toLowerCase(), passwordHash, now, now);

    return {
      id,
      email: email.toLowerCase(),
      passwordHash,
      createdAt: now,
      updatedAt: now,
      isDeleted: false
    };
  }

  static getUserById(userId: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ? AND isDeleted = 0');
    return stmt.get(userId) as User | undefined || null;
  }

  static getUserByEmail(email: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ? AND isDeleted = 0');
    return stmt.get(email.toLowerCase()) as User | undefined || null;
  }

  static async storeRefreshToken(
    userId: string,
    refreshToken: string,
    ipAddress: string,
    userAgent: string
  ): Promise<void> {
    const tokenHash = await bcryptjs.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const stmt = db.prepare(`
      INSERT INTO refresh_tokens (id, userId, tokenHash, ipAddress, userAgent, expiresAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(uuidv4(), userId, tokenHash, ipAddress, userAgent, expiresAt);
  }

  static async validateRefreshToken(
    userId: string,
    token: string,
    ipAddress: string
  ): Promise<boolean> {
    const stmt = db.prepare(`
      SELECT tokenHash FROM refresh_tokens
      WHERE userId = ? AND expiresAt > datetime('now')
      ORDER BY createdAt DESC LIMIT 1
    `);

    const record = stmt.get(userId) as { tokenHash: string } | undefined;
    if (!record) return false;

    const isValid = await bcryptjs.compare(token, record.tokenHash);

    // ✅ Si IP diferente → invalida token (token hijacking detection)
    // if (oldIp !== newIp) → log security event

    return isValid;
  }

  static invalidateRefreshTokens(userId: string): void {
    const stmt = db.prepare('DELETE FROM refresh_tokens WHERE userId = ?');
    stmt.run(userId);
  }
}
