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
      { sub: userId, type: 'access' },
      env.JWT_PRIVATE_KEY,
      { expiresIn: '15m', algorithm: 'HS256' }
    );

    // ✅ Refresh token (7 días)
    const refreshToken = jwt.sign(
      { sub: userId, type: 'refresh' },
      env.JWT_PRIVATE_KEY,
      { expiresIn: '7d', algorithm: 'HS256' }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60 // 15 minutos en segundos
    };
  }

  static verifyToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, env.JWT_PRIVATE_KEY, { algorithms: ['HS256'] }) as JWTPayload;
      return decoded;
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  }

  static async createUser(email: string, password: string): Promise<User> {
    const id = uuidv4();
    const passwordHash = await this.hashPassword(password);
    const now = new Date();

    const stmt = db.prepare(`
      INSERT INTO users (id, email, passwordHash, createdAt, updatedAt)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    stmt.bind([id, email.toLowerCase(), passwordHash]);
    stmt.step();
    stmt.free();

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
    stmt.bind([userId]);
    const hasUser = stmt.step();
    const user = hasUser ? stmt.getAsObject() : null;
    stmt.free();
    return user as User | null;
  }

  static getUserByEmail(email: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ? AND isDeleted = 0');
    stmt.bind([email.toLowerCase()]);
    const hasUser = stmt.step();
    const user = hasUser ? stmt.getAsObject() : null;
    stmt.free();
    return user as User | null;
  }

  static async storeRefreshToken(
    userId: string,
    refreshToken: string,
    ipAddress: string,
    userAgent: string
  ): Promise<void> {
    const tokenHash = await bcryptjs.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const stmt = db.prepare(`
      INSERT INTO refresh_tokens (id, userId, tokenHash, ipAddress, userAgent, expiresAt, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.bind([uuidv4(), userId, tokenHash, ipAddress, userAgent, expiresAt]);
    stmt.step();
    stmt.free();
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

    stmt.bind([userId]);
    const hasRecord = stmt.step();
    const record = hasRecord ? stmt.getAsObject() : null;
    stmt.free();

    if (!record) return false;

    const isValid = await bcryptjs.compare(token, (record as any).tokenHash);

    return isValid;
  }

  static invalidateRefreshTokens(userId: string): void {
    const stmt = db.prepare('DELETE FROM refresh_tokens WHERE userId = ?');
    stmt.bind([userId]);
    stmt.step();
    stmt.free();
  }
}
