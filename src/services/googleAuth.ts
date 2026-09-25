import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { db } from '../db/client.js';
import { AuthService } from './auth.js';
import { env } from '../env.js';
import { logger } from './logger.js';
import { randomUUID } from 'crypto';
import { invitedPlan, onboardUser } from './betaAccess.js';

export function initGoogleAuth() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return;

  passport.use(new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/auth/google/callback',
    },
    (_accessToken, _refreshToken, profile, done) => void (async () => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error('Google no devolvió un email'));

        // Buscar usuario existente por googleId o email
        let user = await db.queryOne<{ id: string; email: string }>(
          'SELECT id, email FROM users WHERE googleId = $1 OR email = $2 LIMIT 1',
          [profile.id, email],
        );

        if (!user) {
          const plan = await invitedPlan(email);
          if (plan === null) return done(null, false);
          const id = randomUUID();
          await db.query(
            'INSERT INTO users (id, email, passwordHash, googleId) VALUES ($1, $2, $3, $4)',
            [id, email, '', profile.id],
          );
          await onboardUser(id, email, plan);
          user = { id, email };
          logger.info('Google OAuth: nuevo usuario creado', { userId: id, email });
        } else {
          // Vincular googleId si aún no lo tiene
          await db.query(
            'UPDATE users SET googleId = $1 WHERE id = $2 AND googleId IS NULL',
            [profile.id, user.id],
          );
        }

        done(null, user);
      } catch (err) {
        done(err as Error);
      }
    })(),
  ));
}

export function issueTokensForUser(userId: string) {
  return AuthService.generateTokens(userId);
}
