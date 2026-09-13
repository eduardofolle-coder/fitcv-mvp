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

    await db.query(`
      INSERT INTO users (id, email, passwordHash, createdAt, updatedAt)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [id, email.toLowerCase(), passwordHash]);

    return {
      id,
      email: email.toLowerCase(),
      passwordHash,
      createdAt: now,
      updatedAt: now,
      isDeleted: false
    };
  }

  static async getUserById(userId: string): Promise<User | null> {
    const user = await db.queryOne('SELECT * FROM users WHERE id = $1 AND isDeleted = FALSE', [userId]);
    return user as User | null;
  }

  static async getUserByEmail(email: string): Promise<User | null> {
    const user = await db.queryOne('SELECT * FROM users WHERE email = $1 AND isDeleted = FALSE', [email.toLowerCase()]);
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

    await db.query(`
      INSERT INTO refresh_tokens (id, userId, tokenHash, ipAddress, userAgent, expiresAt, createdAt)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    `, [uuidv4(), userId, tokenHash, ipAddress, userAgent, expiresAt]);
  }

  static async validateRefreshToken(
    userId: string,
    token: string,
    _ipAddress: string
  ): Promise<boolean> {
    // datetime('now') es de SQLite; en Postgres el equivalente es NOW().
    const record = await db.queryOne<any>(`
      SELECT tokenHash FROM refresh_tokens
      WHERE userId = $1 AND expiresAt > NOW()
      ORDER BY createdAt DESC LIMIT 1
    `, [userId]);

    if (!record) return false;

    const isValid = await bcryptjs.compare(token, (record as any).tokenHash);

    return isValid;
  }

  static async invalidateRefreshTokens(userId: string): Promise<void> {
    await db.query('DELETE FROM refresh_tokens WHERE userId = $1', [userId]);
  }
}
