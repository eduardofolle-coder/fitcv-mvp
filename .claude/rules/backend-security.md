# Backend Security Rules - FITCV

These are non-negotiable security rules for the FITCV backend. Follow strictly.

## Data Encryption at Rest

**Rule:** All sensitive data in database must be encrypted with AES-256-GCM before storage.

**Sensitive Fields:**
- `candidate_profiles.cvOriginalContent` ✅ Encrypted
- `adapted_cvs.htmlContent` ✅ Encrypted
- `audit_logs.detailsEncrypted` ✅ Encrypted
- `users.email` ❌ NOT encrypted (needed for login query)
- `users.passwordHash` ❌ NOT encrypted (hashed, not encrypted)

**Format:** All encrypted values stored as `{iv}:{authTag}:{ciphertext}` in hex encoding

**Implementation:**
```typescript
const encrypted = EncryptionService.encrypt(sensitiveData);
// Result: "a1b2c3d4:e5f6g7h8:i9j0k1l2..."
```

**Verification:** Decrypt and verify during read
```typescript
const decrypted = EncryptionService.decrypt(encryptedData);
```

**Violation:** Any plaintext sensitive data in database = Critical security breach

---

## Authentication & Tokens

**Rule:** All API requests (except auth) must include valid JWT in Authorization header.

**Token Requirements:**
- Algorithm: HS256
- Access Token Expiry: 15 minutes
- Refresh Token Expiry: 7 days
- Signing Key: From `JWT_SECRET` env var (min 32 chars)

**Token Validation:**
```typescript
// ✅ CORRECT
const token = req.headers.authorization?.split(' ')[1];
const decoded = jwt.verify(token, process.env.JWT_SECRET);

// ❌ WRONG - Don't skip verification
const decoded = jwt.decode(token); // NO - skips signature check
```

**Refresh Token Rules:**
1. Rotate on every refresh (old token becomes invalid)
2. Track IP address + User-Agent
3. Detect hijacking (IP/UA mismatch on refresh)
4. Store hash of token, never plaintext
5. Validate refresh token exists before issuing new access token

**Violation:** Accepting unverified tokens = Authentication bypass

---

## Password Security

**Rule:** Passwords must be hashed with bcryptjs (salt rounds: 12). Never store plaintext.

**Implementation:**
```typescript
// ✅ CORRECT
const hash = await bcrypt.hash(password, 12);
const isValid = await bcrypt.compare(passwordAttempt, storedHash);

// ❌ WRONG
const hash = crypto.sha256(password); // NO - weak hashing
const isValid = (password === storedPassword); // NO - plaintext comparison
```

**Password Requirements:**
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special symbol (!@#$%^&*)

**Validation:**
```typescript
const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
if (!passwordRegex.test(password)) {
  throw new Error('Password does not meet requirements');
}
```

**Violation:** Weak password validation = User accounts compromised

---

## API Rate Limiting

**Rule:** Apply rate limiting to sensitive endpoints to prevent brute force and DoS.

**Limits:**
- Login endpoint: 5 attempts per 15 minutes per IP
- CV upload: 5 uploads per hour per user
- General API: 100 requests per minute per user
- Password reset: 3 attempts per hour per email

**Implementation:**
```typescript
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests
  message: 'Too many login attempts, try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/api/auth/login', loginLimiter, authController.login);
```

**Violation:** Missing rate limiting = Brute force attacks possible

---

## CORS Configuration

**Rule:** CORS must be explicitly configured with whitelist of allowed origins.

**Development:**
```typescript
cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
})
```

**Production:**
```typescript
cors({
  origin: ['https://fitcv.com', 'https://app.fitcv.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
})
```

**Rules:**
- Never use `origin: '*'` for credentials
- Never allow `Access-Control-Allow-Origin: *` with credentials: true
- Explicitly list all allowed origins
- Use https in production

**Violation:** Open CORS = Cross-origin attacks possible

---

## Input Validation

**Rule:** Validate ALL user input with strict schemas before processing.

**Implementation:**
```typescript
// ✅ CORRECT - Use Joi
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(12).required(),
});

const { error, value } = registerSchema.validate(req.body);
if (error) throw new ValidationError(error.message);

// ❌ WRONG - Trust user input
const { email, password } = req.body;
// No validation - vulnerable to injection
```

**Validation Requirements:**
- Email format validation
- Password strength validation (12+ chars, mixed case, numbers, symbols)
- Array length limits (max 100 items)
- String length limits (no unlimited strings)
- Number range limits
- Enum validation (only allowed values)

**Violation:** Missing validation = Injection attacks possible

---

## Audit Logging

**Rule:** All security events must be logged to encrypted audit trail.

**Events to Log:**
- User registration
- Login attempts (success and failure)
- Failed login (3+ triggers alert)
- Unauthorized access attempts
- Token refresh
- CV upload
- Postulation creation
- Any error

**Format:**
```json
{
  "timestamp": "2026-09-12T14:30:00Z",
  "userId": "user-123",
  "event": "LOGIN_FAILED",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "details": "{encrypted}",
  "status": "FAILED"
}
```

**Details Encrypted:**
```typescript
const encrypted = EncryptionService.encrypt(
  JSON.stringify({ attemptCount: 3, reason: 'Wrong password' })
);
// Store encrypted value in database
```

**Violation:** Missing audit logging = Can't detect attacks or investigate incidents

---

## Secret Management

**Rule:** Never hardcode secrets. All sensitive values in `.env` file.

**Secrets File: `.env`**
```
NODE_ENV=development
JWT_SECRET=your-secret-here-min-32-chars-long
CLAUDE_API_KEY=sk-ant-xxxxx
ENCRYPTION_KEY=your-32-char-encryption-key
DATABASE_PASSWORD=yourdbpassword
```

**Rules:**
- ✅ Read from environment at startup
- ❌ Never commit `.env` to git
- ❌ Never log secret values
- ❌ Never include in API responses
- ✅ Use different secrets per environment (dev/staging/prod)

**Code:**
```typescript
// ✅ CORRECT
const jwtSecret = process.env.JWT_SECRET;
const token = jwt.sign(payload, jwtSecret);

// ❌ WRONG
const jwtSecret = 'secret123'; // Hardcoded
const token = jwt.sign(payload, jwtSecret);

// ❌ WRONG
logger.info(`JWT Secret: ${jwtSecret}`); // Leaked in logs
```

**Violation:** Exposed secrets = Complete system compromise

---

## HTTP Security Headers

**Rule:** Enable security headers with Helmet.js.

**Implementation:**
```typescript
import helmet from 'helmet';
app.use(helmet());
```

**Headers Enabled:**
- Content-Security-Policy (CSP) - Prevent XSS
- X-Frame-Options - Prevent clickjacking
- X-Content-Type-Options - Prevent MIME sniffing
- Strict-Transport-Security (HSTS) - Force HTTPS
- X-XSS-Protection - Browser XSS protection

**Production HSTS:**
```typescript
helmet.hsts({
  maxAge: 31536000, // 1 year
  includeSubDomains: true,
  preload: true,
})
```

**Violation:** Missing headers = Various browser-based attacks

---

## Database Query Safety

**Rule:** Use parameterized queries only. Never concatenate SQL strings.

**Implementation:**
```typescript
// ✅ CORRECT - Parameterized
const user = await db.query(
  'SELECT * FROM users WHERE email = ? AND isDeleted = ?',
  [email, false]
);

// ❌ WRONG - SQL Injection vulnerable
const user = await db.query(
  `SELECT * FROM users WHERE email = '${email}' AND isDeleted = 0`
);
```

**Rules:**
- Always use `?` placeholders
- Never concatenate user input into SQL
- sql.js handles parameterization with array passing
- PostgreSQL (production) uses `$1, $2` placeholders

**Violation:** SQL injection = Database compromise + data theft

---

## Error Handling

**Rule:** Never leak sensitive information in error messages.

**Development:**
```typescript
// ✅ CORRECT in development
console.error('Full error:', error); // OK, logs full stack
res.status(500).json({ error: error.message }); // OK, detailed error
```

**Production:**
```typescript
// ✅ CORRECT in production
if (process.env.NODE_ENV === 'production') {
  res.status(500).json({ error: 'Internal server error' }); // Generic message
  logger.error('Error details', { stack: error.stack }); // Logged securely
}

// ❌ WRONG in production
res.status(500).json({ error: `DB connection failed: ${dbError}` }); // Leaks info
```

**Sensitive Info Never in Response:**
- Database errors
- File paths
- Stack traces
- Internal IPs
- API keys
- User IDs (unless authorized)

**Violation:** Error information leakage = Reconnaissance for attacks

---

## Data Retention & Deletion

**Rule:** Implement proper data deletion and retention policies.

**Retention Policy:**
- User data: Kept until account deletion
- Audit logs: Kept for 1 year (compliance)
- Session tokens: Expired after 7 days
- Temporary files: Deleted after 24 hours

**Soft Delete:**
```typescript
// Mark as deleted, never hard delete
UPDATE users SET isDeleted = true, deletedAt = NOW() WHERE id = ?

// Query excludes deleted records
SELECT * FROM users WHERE isDeleted = false
```

**Data Deletion Request:**
```typescript
// When user requests deletion
DELETE FROM candidate_profiles WHERE userId = ?
DELETE FROM adapted_cvs WHERE userId = ?
DELETE FROM postulations WHERE userId = ?
DELETE FROM refresh_tokens WHERE userId = ?
UPDATE users SET isDeleted = true WHERE id = ?
```

**Violation:** Missing deletion = GDPR/privacy violations

---

## Dependency Security

**Rule:** Keep dependencies updated. Run security audits regularly.

**Commands:**
```bash
# Check for vulnerabilities
npm audit

# Update vulnerable packages
npm audit fix

# Review updates before installing
npm outdated
npm update
```

**Policy:**
- Run `npm audit` before every release
- Fix critical vulnerabilities immediately
- Review major version updates before upgrading
- Use exact versions (npm install --save-exact)

**Violation:** Outdated dependencies = Known vulnerabilities

---

## Checklist Before Production Deploy

- [ ] All secrets in `.env`, not hardcoded
- [ ] Encryption enabled for sensitive fields
- [ ] Rate limiting active on all auth endpoints
- [ ] CORS configured with explicit whitelist
- [ ] Helmet.js enabled with HSTS
- [ ] Input validation on all endpoints
- [ ] Audit logging functional
- [ ] Error messages generic (no leak)
- [ ] JWT secret is strong (32+ chars)
- [ ] HTTPS enabled
- [ ] Database has backups
- [ ] No test data in production
- [ ] Security scan passes: `npm audit` clean
- [ ] Code review approved
- [ ] Load tested under expected traffic

---

## Reporting Security Issues

If you find a security vulnerability:

1. **Don't:** Post to public issues/forums
2. **Do:** Report privately to project owner
3. **Include:** Description, reproduction steps, potential impact
4. **Wait:** For fix and release before public disclosure

---

## References

- OWASP Top 10: https://owasp.org/Top10/
- Node.js Security Best Practices: https://nodejs.org/en/docs/guides/security/
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework
