/**
 * Postgres pliega identificadores sin comillas a minúsculas. Si el citado
 * falla, `row.passwordHash` queda en undefined sin lanzar ningún error: el
 * login simplemente deja de funcionar. Esta capa merece tests propios.
 */
import { describe, it, expect } from 'vitest';
import { quoteCamelCaseIdentifiers } from '../src/db/client.js';

describe('camelCase identifier quoting', () => {
  it('quotes camelCase column names', () => {
    expect(quoteCamelCaseIdentifiers('SELECT passwordHash FROM users')).toBe(
      'SELECT "passwordHash" FROM users'
    );
  });

  it('quotes every camelCase identifier in a statement', () => {
    const out = quoteCamelCaseIdentifiers(
      'SELECT id, userId, createdAt FROM postulations WHERE offerId = $1'
    );
    expect(out).toBe(
      'SELECT id, "userId", "createdAt" FROM postulations WHERE "offerId" = $1'
    );
  });

  it('leaves SQL keywords and snake_case alone', () => {
    const sql = 'SELECT * FROM candidate_profiles WHERE id = $1 ORDER BY id DESC LIMIT 1';
    expect(quoteCamelCaseIdentifiers(sql)).toBe(sql);
  });

  it('leaves all-caps functions alone', () => {
    const sql = 'INSERT INTO t (a) VALUES (CURRENT_TIMESTAMP)';
    expect(quoteCamelCaseIdentifiers(sql)).toBe(sql);
  });

  it('handles qualified names in upserts', () => {
    const out = quoteCamelCaseIdentifiers(
      'ON CONFLICT(userId) DO UPDATE SET fullName = excluded.fullName'
    );
    expect(out).toBe(
      'ON CONFLICT("userId") DO UPDATE SET "fullName" = excluded."fullName"'
    );
  });

  it('does not touch parameter placeholders', () => {
    const out = quoteCamelCaseIdentifiers('WHERE userId = $1 AND offerId = $2');
    expect(out).toContain('$1');
    expect(out).toContain('$2');
  });

  it('quotes identifiers that repeat', () => {
    const out = quoteCamelCaseIdentifiers('SET userId = $1 WHERE userId = $2');
    expect(out).toBe('SET "userId" = $1 WHERE "userId" = $2');
  });
});
