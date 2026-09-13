# CLAUDE.md - FITCV Project Guidelines

This file provides guidance to Claude Code when working with the FITCV MVP project.

## Project Overview

**FITCV** is a SaaS platform for intelligent CV adaptation and job matching in LATAM (Chile pilot).

- **Purpose:** Auto-apply to job postulations with AI-adapted CVs
- **Tech Stack:** Node.js + Express + TypeScript + SQLite (MVP) → PostgreSQL (v1.0)
- **Architecture:** Agentic backend with specialized agents for CV analysis, job matching, and opportunity ranking

## Current Phase: Phase 1 - Agent Foundation

**Location:** C:\Users\Userx\Desktop\fitcv-mvp

**Deliverable:** 5 production-ready agents + ECC integration

### Agent Files
- `.agents/cv-analyzer-agent.md` - Parses CV, extracts structured profile
- `.agents/postulation-matcher-agent.md` - Scores job fit (0-100)
- `.agents/cv-adapter-agent.md` - Adapts CV for specific role, optimizes for ATS
- `.agents/offer-ranker-agent.md` - Ranks opportunities by fit
- `.agents/postulation-orchestrator.md` - Coordinates all agents

## Code Style & Conventions

### TypeScript / Node.js

**File Naming:** camelCase
- `services/cvAdapter.ts`
- `routes/postulations.ts`
- `middleware/errorHandler.ts`

**Folder Structure:**
```
src/
├── server.ts                 # Main app
├── env.ts                    # Config
├── types/index.ts            # Interfaces
├── routes/                   # Route handlers
├── services/                 # Business logic
├── middleware/               # Express middleware
└── db/                       # Database layer
```

**Imports:** Prefer relative imports
```typescript
import { User, Postulation } from '../types';
import { AuthService } from '../services/auth';
```

**Export Style:** Mixed named + default as needed
```typescript
export interface CandidateProfile { ... }
export class CVAdapterService { ... }
export default router;
```

### Security Baseline (14 Layers - DO NOT REMOVE)

**1. Authentication**
- JWT tokens (HS256, 15-min access, 7-day refresh)
- Password hashing: bcryptjs with 12 salt rounds
- Token rotation on refresh

**2. Encryption**
- Data at rest: AES-256-GCM for sensitive fields
- CV content, adapted CVs, audit log details all encrypted
- Format: `{iv}:{authTag}:{ciphertext}` (hex encoded)

**3. API Security**
- CORS: Whitelist allowed origins
- Rate limiting: 
  - Login: 5 attempts / 15 minutes
  - CV upload: 5 / hour
  - General API: 100 / minute per user

**4. Input Validation**
- Joi schemas for all requests
- Email format validation
- Strong password requirement: 12+ chars, mixed case, numbers, symbols

**5. Error Handling**
- Development: Full stack trace
- Production: Generic error messages (never leak internal details)
- All errors logged to audit trail

**6. Audit Logging**
- Track: LOGIN, LOGOUT, FAILED_LOGIN, UNAUTHORIZED_ACCESS
- Encrypted in database with timestamp
- Indexed by userId + date for compliance

**7. Token Hijacking Prevention**
- Refresh tokens track IP address + User-Agent
- Detect mismatches on refresh attempt

**8. HTTP Security**
- Helmet.js headers enabled
- HSTS ready (add to prod config)
- CSRF protection ready

**9. Database**
- Parameterized queries (sql.js)
- No raw SQL string concatenation
- Encrypt sensitive columns before storage

**10-14. Additional Layers**
- HTTP-only cookies for tokens (when using cookies)
- HTTPS required in production
- Secrets in .env (never hardcoded)
- Refresh token storage with hash (not plaintext)
- IP address tracking for anomaly detection

**CRITICAL:** If any security layer is removed or weakened, create a task and explain why to the project owner.

## Database Schema

**Current:** SQLite (sql.js) for MVP  
**Production:** PostgreSQL

**Tables:**
- `users` - Registered candidates
- `candidate_profiles` - Parsed CV data (encrypted)
- `suggested_roles` - AI-generated role suggestions
- `offers` - Job listings (seed data for MVP)
- `postulations` - User applications + status tracking
- `adapted_cvs` - Customized CVs per application (encrypted)
- `refresh_tokens` - Active tokens + device info
- `audit_logs` - Security events (encrypted)

**Schema Policy:** No breaking changes. Add columns/tables only, never drop.

## API Conventions

**Base URL:** `http://localhost:3000/api`

**Authentication:** Bearer token in Authorization header
```
Authorization: Bearer <access_token>
```

**Response Format:**
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorId?: string; // For tracking
}
```

**Status Codes:**
- 200: Success
- 201: Created
- 400: Bad request (validation error)
- 401: Unauthorized (invalid/expired token)
- 403: Forbidden (insufficient permissions)
- 429: Too many requests (rate limited)
- 500: Server error (generic message in prod)

## Routes Implemented (Phase 1)

### Authentication
- `POST /api/auth/register` - Sign up
- `POST /api/auth/login` - Sign in
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Revoke tokens

### Upcoming (Phase 2)
- `POST /api/cv/upload` - Upload CV → Analyzer
- `GET /api/cv/profile` - Get parsed profile
- `POST /api/postulations` - Create application
- `GET /api/postulations` - List user's applications
- `POST /api/postulations/:id/generate-cv` - Adapter
- `GET /api/offers` - List job opportunities
- `POST /api/postulations/match` - Matcher
- `GET /api/offers/ranked` - Ranker

## Development Workflow: ECC Integration

### Using Claude Code Commands

**Planning New Feature**
```bash
/plan "Design CV upload endpoint with ProfileAnalyzerService integration"
```

**Test-Driven Development**
```bash
/tdd "Implement postulation matching algorithm"
# 1. Writes tests first
# 2. Implements to pass tests
# 3. Refactors for clarity
```

**Code Review**
```bash
/code-review
# Checks for security violations, best practices, complexity
```

**Security Audit**
```bash
/security-scan
# Checks for OWASP vulnerabilities, hardcoded secrets, injection risks
```

### Pre-Commit Hook

When committing:
1. TypeScript must compile without errors
2. ESLint must pass
3. Unit tests must pass
4. No hardcoded secrets allowed
5. Security audit must pass

Hook file: `.claude/hooks/pre-commit-backend.js`

## Services Architecture

### AuthService
- User registration + login
- Password hashing (bcryptjs)
- JWT generation + verification
- Token refresh + rotation
- Refresh token validation (IP tracking)

**Location:** `services/auth.ts`

### CVAdapterService
- Takes original CV + job description
- Calls Claude API (or fallback)
- Returns adapted CV + ATS score + keyword list
- Tracks changes made

**Location:** `services/cvAdapter.ts`

### ProfileAnalyzerService
- Parses CV text
- Extracts structured profile
- Generates role suggestions
- Calculates experience level

**Location:** `services/profileAnalyzer.ts`

### EncryptionService
- AES-256-GCM encryption/decryption
- Handles IV + auth tag + ciphertext packing

**Location:** `services/encryption.ts`

### AuditLogger
- Logs security events
- Encrypts sensitive details
- Indexes for compliance

**Location:** `services/logger.ts`

## Environment Variables

**Required:**
```
CLAUDE_API_KEY=sk-ant-xxxxx        # Claude API key
```

**Optional (have dev defaults):**
```
PORT=3000
NODE_ENV=development
JWT_SECRET=dev-secret-change-in-prod
DB_PATH=./db/fitcv.db
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
ENCRYPTION_KEY=dev-key-32-chars-change-prod
```

## Testing Requirements

**Run Tests:**
```bash
npm test
```

**Coverage Goal:** 80%+ for services, routes, middleware

**Test Types:**
- Unit: Service functions
- Integration: Route + service interactions
- E2E: Full postulation workflow

## Git Workflow

**Commit Message Format:**
```
feat: Add CV analyzer agent

- Parses CV text into structured profile
- Extracts skills, experience, education
- Validates completeness
- Returns quality metrics

Closes #1
```

**Prefix Convention:**
- `feat:` New feature
- `fix:` Bug fix
- `refactor:` Code restructuring
- `test:` Testing
- `docs:` Documentation
- `chore:` Dependencies, config

**Branches:**
- `main` - Production release
- `phase-1`, `phase-2`, etc. - Feature branches
- Feature: `feature/agent-cv-analyzer`
- Bug: `fix/jwt-expiry-issue`

## Performance Targets

- Server startup: < 500ms
- Health check: < 10ms
- Auth endpoints: < 200ms
- Agent invocations: < 5s (with Claude API)
- Database queries: < 100ms

## Monitoring & Logging

- Application logs: Winston (json format)
- Security events: Encrypted audit trail
- Performance: Track agent invocation times
- Errors: Capture stack traces (dev only)

**Log Levels:**
- `error` - Critical failures
- `warn` - Potential issues
- `info` - Important events (logins, applications)
- `debug` - Detailed execution flow (dev only)

## Contributing

When working on FITCV:

1. **Understand the Phase:** Know which phase you're in
2. **Follow Security Baseline:** Never weaken security layers
3. **Use ECC Commands:** /plan, /tdd, /code-review, /security-scan
4. **Test First:** Write tests before implementation
5. **Document Changes:** Update this CLAUDE.md if conventions change
6. **Commit Properly:** Use conventional commit format
7. **Code Review:** Get approval before merging to main

## Key Decisions

### Why Agents?
- Modularity: Each agent has single responsibility
- Reusability: Same agents work in dev and production
- Testability: Can test agents independently
- Scaling: Can upgrade agents without touching routes

### Why Memory Vault?
- Learning: Store successful CV patterns
- Personalization: Track user preferences over time
- Compliance: Audit trail of decisions
- Improvement: Continuous learning for better recommendations

### Why Hybrid (Dev + Production)?
- Fast Development: ECC automates feature development
- Production Stability: Agents are proven ECC patterns
- Quality: /code-review, /security-scan catch issues early
- Cost: Agents run on Claude API (pay per use in production)

## Support & Debugging

**Debug Mode:**
```bash
DEBUG=fitcv:* npm run dev
```

**Common Issues:**
- JWT expired: Call /refresh endpoint
- Rate limit hit: Wait 15 minutes (login) or 1 hour (CV upload)
- Agent fails: Check Claude API key in .env
- Database error: Check db/fitcv.db exists and is writable

**Get Help:**
- Check error logs with: `npm run logs`
- Run tests to isolate issue: `npm test`
- Use /security-scan for vulnerabilities
- Use /code-review for logic errors

## Project Status

- **Phase 1:** ✅ Complete (agent framework)
- **Phase 2:** ⏳ In Progress (route integration)
- **Phase 3:** 🔄 Planned (ECC automation)
- **Phase 4:** 🔄 Planned (memory vault)
- **Phase 5:** 🔄 Planned (frontend)

Current focus: Phase 2 implementation
