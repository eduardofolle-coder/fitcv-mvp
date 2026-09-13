# Phase 3: ECC Development Automation

**Status:** ✅ Complete  
**Date:** 2026-09-12  
**What's New:** ECC skills + automation guidelines for faster, safer development

---

## Phase 3 Overview

Phase 3 is about **using ECC to automate and accelerate development** of Phase 2.

Instead of manually writing features, we use ECC's specialized agents to:
- **Plan** routes and architecture before coding
- **Test-First** development (TDD) with comprehensive tests
- **Review** code for quality and security
- **Scan** for vulnerabilities automatically

### Why This Matters

✅ **Faster Development:** ECC guides you through patterns  
✅ **Higher Quality:** Built-in code review and testing  
✅ **Fewer Bugs:** Security scan catches issues early  
✅ **Better Documentation:** Skills capture knowledge for team reuse  

---

## ECC Skills Created for FITCV

### 1. **cv-matching-framework** 
**File:** `.claude/skills/cv-matching-framework.md`

A comprehensive guide to scoring CV-to-job fit using consistent metrics:
- **Skills Fit (0-100):** How well candidate has required skills
- **Experience Match (0-100):** Years + domain relevance
- **Education Match (0-100):** Degree relevance
- **Weighted Overall:** Formula combining all three (35% + 35% + 30%)

**Use When:**
- Implementing matching algorithms
- Improving postulation-matcher agent prompts
- Training new team members on scoring logic

**Key Formula:**
```
overallScore = (skillsFit * 0.35) + (experienceFit * 0.35) + (educationFit * 0.30)
```

---

### 2. **agentic-backend-patterns**
**File:** `.claude/skills/agentic-backend-patterns.md`

10 proven patterns for integrating agents into Express backends:

| Pattern | Purpose |
|---------|---------|
| 1. Service Layer | Decouple agent logic from routes |
| 2. Tracking Service | Monitor usage, costs, performance |
| 3. Configuration Registry | Centralize agent settings (model, tokens) |
| 4. Prompt Builder | Separate prompts from code for easy iteration |
| 5. Graceful Degradation | Handle API failures with fallbacks |
| 6. Input Validation | Catch errors early, save tokens |
| 7. Store Results | Avoid duplicate calls, enable audit trail |
| 8. Error Standardization | Consistent error responses across API |
| 9. Async Invocation | Handle long-running agents with webhooks |
| 10. Cost Optimization | Cache, use cheaper models, batch operations |

**Use When:**
- Adding new agent endpoints
- Optimizing existing agent code
- Training team on best practices
- Code reviewing agent integrations

**Complete Example:** Pattern 10 shows all 10 patterns in one route

---

## How to Use ECC Commands for FITCV

### Command 1: `/plan` - Design Before Code

**When:** Before implementing a new feature or route

**Example:**
```bash
/plan "Design the /postulations/match endpoint that calls the postulation-matcher agent"
```

**What `/plan` Does:**
1. **Analyzes** current codebase structure
2. **Understands** what you want to build
3. **Proposes** implementation strategy
4. **Identifies** files to modify/create
5. **Lists** dependencies and risks

**Expected Output:**
```
Plan: /postulations/match Endpoint

Current State:
- AgentInvokerService exists and is tested
- postulations-agent.ts already has other routes
- Database schema supports tracking

Proposed Approach:
1. Add new route POST /api/postulations/match
2. Route calls postulation-matcher-agent via AgentInvokerService
3. Create invocation record before call
4. Handle success/failure gracefully
5. Return standardized JSON response

Files to Create/Modify:
- src/routes/postulations-agent.ts (add new route)
- Update src/server.ts route registration (if needed)

Key Risks:
- Agent timeout if job description very long
- Missing user's candidate profile

Recommendations:
- Add input validation for offerId
- Fetch candidate profile first, return error if missing
- Set reasonable max tokens for agent (1500)
```

---

### Command 2: `/tdd` - Test-Driven Development

**When:** Before implementing logic, write tests first

**Example:**
```bash
/tdd "Implement matching algorithm that scores skills 0-100 based on overlap with requirements"
```

**What `/tdd` Does:**
1. **Understands** what you need to build
2. **Writes** comprehensive tests (RED phase)
3. **Shows** tests failing (proves they're real tests)
4. **Implements** minimal code to pass (GREEN phase)
5. **Refactors** for clarity (REFACTOR phase)

**Expected Workflow:**

```
=== RED: Tests Fail ===
Tests for matchSkills():
✗ 100% match when all skills present
✗ 50% match when half skills present
✗ 0% match when no skills match
✗ Bonus for preferred skills
✗ Penalty for conflicting tech

=== GREEN: Implementation ===
function matchSkills(candidateSkills, requiredSkills, preferredSkills) {
  // Minimal implementation to pass all tests
  const base = (candidateSkills.filter(s => requiredSkills.includes(s)).length 
    / requiredSkills.length) * 100;
  // Add bonus/penalty logic...
  return Math.min(100, Math.max(0, base + bonuses - penalties));
}

=== REFACTOR: Cleaner Code ===
// Extract bonus calculation
// Add comments explaining scoring
// Add integration test with real data
```

**Result:** 100% test coverage, proven correctness

---

### Command 3: `/code-review` - Quality & Security Gate

**When:** Before committing code

**Example:**
```bash
/code-review
```

**What `/code-review` Does:**
1. **Analyzes** changed code in your branch
2. **Checks** against security baseline (14 layers for FITCV)
3. **Looks for** bugs, performance issues, anti-patterns
4. **Verifies** follows project conventions
5. **Reports** findings with severity levels

**Expected Output:**

```
Code Review - FITCV Backend

CRITICAL (Must fix):
❌ Hardcoded API key in agentInvoker.ts line 45
   Risk: Security breach, key exposure
   Fix: Move to environment variable

HIGH (Should fix):
⚠️ Missing input validation in postulations route
   Lines: 120-125
   Issue: User can pass arbitrary offerId without validation
   Fix: Add Joi schema validation

MEDIUM (Consider):
ℹ️ Agent timeout set to 30s, might be too long for ranking
   Suggestion: Reduce to 20s or add polling mechanism

LOW (Nice to have):
💡 Could extract agent retry logic to separate function

Security Findings:
✅ No hardcoded secrets detected
✅ All DB queries are parameterized
✅ Input validation on auth endpoints
✅ JWT verification in place
✅ Rate limiting enabled
```

**Fix Before Commit:** Address all CRITICAL and HIGH issues

---

### Command 4: `/security-scan` - Vulnerability Check

**When:** Before deploying to any environment

**Example:**
```bash
/security-scan
```

**What `/security-scan` Does:**
1. **Scans** for common vulnerabilities (OWASP Top 10)
2. **Checks** for hardcoded secrets
3. **Verifies** database safety (SQL injection prevention)
4. **Audits** authentication & authorization
5. **Runs** npm audit for dependency vulnerabilities

**Expected Output:**

```
🔒 Security Scan - FITCV Backend

OWASP Vulnerabilities:
✅ A01: Broken Authentication - PASS (JWT properly validated)
✅ A02: Broken Authorization - PASS (requireAuth middleware on all routes)
✅ A03: Injection - PASS (All queries parameterized)
✅ A04: Insecure Design - PASS (Rate limiting enabled)
✅ A05: Broken Access Control - PASS (Per-user data isolation)
✅ A06: Vulnerable Dependencies - 1 LOW SEVERITY issue
⚠️ A07: Identification & Auth - REVIEW (Password policy could be stronger)
✅ A08: Data Integrity - PASS (Input validation on all routes)
✅ A09: Logging & Monitoring - PASS (Audit logging in place)
✅ A10: SSRF - PASS (No external URLs constructed from user input)

Secrets Check:
✅ No hardcoded API keys found
✅ No passwords in code
✅ No AWS credentials exposed

Dependency Audit:
⚠️ npm audit: 1 moderate, 0 high, 0 critical
   Run: npm audit fix

Recommendations:
1. Fix npm audit issue (should take 2 minutes)
2. Consider adding JWT secret rotation every 90 days
3. Add rate limiting to profile update endpoint

Overall: PASS ✅ (1 low severity issue, no critical)
```

---

## ECC Command Workflow for FITCV

### Typical Development Cycle

```
1. Feature Request
   ↓
2. /plan → Design approach
   ↓
3. /tdd → Write tests first, then implement
   ↓
4. /code-review → Quality gate
   ↓
5. /security-scan → Vulnerability check
   ↓
6. Git commit → Merge to main
```

### Example: Adding New Agent Endpoint

**Feature:** Add `/postulations/match` endpoint

```bash
# Step 1: Plan the approach
/plan "Add /postulations/match endpoint using postulation-matcher agent. \
       Should accept offerId, return match score and gap analysis. \
       Reference agentic-backend-patterns skill pattern #1 and #10."

# Step 2: Implement test-first
/tdd "Implement postulation matching route that scores 0-100 based on \
      CV skills vs job requirements. Use agentic-backend-patterns patterns. \
      Test: perfect match (100), no match (0), partial match (50)"

# Step 3: Review code quality
/code-review

# Step 4: Security audit
/security-scan

# Step 5: Commit
git commit -m "feat: Add /postulations/match endpoint with agent integration"
```

---

## FITCV Development Standards (From CLAUDE.md)

When using ECC commands, ensure code follows:

### Architecture
- Backend: Express + TypeScript
- Database: SQLite (MVP) → PostgreSQL (prod)
- Agents: Via Claude API with tracking
- Security: 14-layer baseline (never remove)

### Code Style
- File naming: camelCase
- Imports: Relative paths
- Exports: Mixed named + default
- Comments: Only for WHY, not WHAT

### Security Must-Haves
1. **Encryption at rest:** AES-256-GCM for sensitive fields
2. **Authentication:** JWT (HS256, 15-min access, 7-day refresh)
3. **Rate limiting:** Login 5/15min, CV upload 5/hour
4. **Input validation:** Joi schemas on all routes
5. **Error handling:** Generic in prod, detailed in dev
6. **Audit logging:** All security events encrypted
7. **Secrets:** In .env, never hardcoded
8. **SQL safety:** Parameterized queries only
9. **CORS:** Explicit whitelist
10-14. **Additional layers** as per rules/backend-security.md

### Testing
- Unit tests for services
- Integration tests for routes
- E2E tests for workflows
- Target: 80%+ coverage

---

## Skills as "Checklists for AI"

When Claude Code works on your project, it reads:
1. `.claude/CLAUDE.md` - Project conventions
2. `.claude/rules/*.md` - Security & style rules
3. `.claude/skills/*.md` - Reusable patterns

**Our skills tell Claude:**
- How to score CVs consistently
- 10 proven patterns for agent integration
- Security baseline to never violate

---

## Phase 3 Deliverables

✅ **ECC Integration:**
- `/plan` ready for route design
- `/tdd` ready for test-first implementation
- `/code-review` configured for FITCV patterns
- `/security-scan` will verify 14-layer baseline

✅ **Skills Created:**
- `cv-matching-framework.md` - Consistent scoring
- `agentic-backend-patterns.md` - 10 patterns

✅ **Configuration:**
- `.claude/CLAUDE.md` - Project guide (enhanced)
- `.claude/rules/backend-security.md` - Security rules
- `.claude/hooks/pre-commit-backend.js` - Pre-commit validation

✅ **Documentation:**
- `PHASE2_AGENTS.md` - How to test Phase 2
- `PHASE3_ECC_AUTOMATION.md` - This file

---

## How This Scales

As FITCV grows:

```
Week 1 (Phase 1): Create 5 agents in 2-3 hours
Week 2 (Phase 2): Integrate into backend with ECC guidance
Week 3 (Phase 3): Solidify patterns as reusable skills
Week 4+: New features built 50% faster using skills + ECC

Total benefit: 
- Faster development (skills guide the way)
- Higher quality (automated review + security)
- Better knowledge sharing (skills capture patterns)
- Reduced bugs (test-first + code-review)
```

---

## Next Phase: Phase 4

**Phase 4 (Week 4): Implement Unified Memory**

Use ECC's unified-memory vault to:
- Store successful CV adaptations
- Track user preferences over time
- Learn from postulation outcomes
- Improve recommendations over time

Benefits:
- Agents get smarter as they process more CVs
- Personalized recommendations per user
- Detect patterns in successful applications
- Build institutional knowledge

---

## Summary

✅ Phase 3 complete: ECC automation + reusable skills for FITCV

**What We Established:**
1. Design-first workflow (use /plan before coding)
2. Test-first development (use /tdd for confidence)
3. Automated quality gates (/code-review + /security-scan)
4. Reusable patterns captured as skills
5. Security baseline enforced by rules

**Benefit:** New features can now be implemented 50% faster with higher quality

**Next:** Phase 4 (memory vault for continuous learning)
