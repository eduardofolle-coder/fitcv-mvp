# FITCV Backend Testing Plan

**Objective:** Exhaustive testing of all backend endpoints to detect and document bugs

**Date:** 2026-09-12
**Status:** In Progress

---

## Testing Scope

### 1. Authentication Endpoints
- [x] POST /api/auth/register
- [x] POST /api/auth/login
- [x] POST /api/auth/refresh
- [x] POST /api/auth/logout

### 2. CV Endpoints
- [x] POST /api/cv/upload
- [x] GET /api/cv/profile
- [x] GET /api/cv/stats

### 3. Postulation Endpoints
- [x] POST /api/postulations
- [x] GET /api/postulations
- [x] GET /api/postulations/:id
- [x] PUT /api/postulations/:id
- [x] DELETE /api/postulations/:id
- [x] POST /api/postulations/:id/generate-cv
- [x] POST /api/postulations/match

### 4. Offers Endpoints
- [x] GET /api/offers
- [x] GET /api/offers/ranked

### 5. Learning Endpoints
- [x] POST /api/learning/outcome
- [x] GET /api/learning/summary
- [x] GET /api/learning/export
- [x] DELETE /api/learning/clear

### 6. Health Check
- [x] GET /health
- [x] GET /

---

## Test Cases

### Auth Flow

#### Register - Valid Data
```
POST /api/auth/register
{
  "email": "testuser@example.com",
  "password": "TestPass123!"
}

Expected: 201 with user object and tokens
```

#### Register - Duplicate Email
```
POST /api/auth/register
{
  "email": "existing@example.com",
  "password": "TestPass123!"
}

Expected: 400 with error message
```

#### Login - Valid
```
POST /api/auth/login
{
  "email": "testuser@example.com",
  "password": "TestPass123!"
}

Expected: 200 with tokens
```

#### Login - Invalid Password
```
POST /api/auth/login
{
  "email": "testuser@example.com",
  "password": "WrongPassword"
}

Expected: 401 Unauthorized
```

---

### CV Upload & Analysis

#### Upload CV - Valid
```
POST /api/cv/upload
{
  "cvText": "John Doe\nEmail: john@example.com\n\nEXPERIENCE:\nSenior Software Engineer at TechCorp (2020-2024)\n- Led team of 5 engineers\n- Python, JavaScript, AWS\n\nEDUCATION:\nBS Computer Science, University (2018)"
}

Expected: 200 with extracted profile
```

#### Upload CV - Too Short
```
POST /api/cv/upload
{
  "cvText": "Short"
}

Expected: 400 with validation error
```

#### Get Profile - No CV
```
GET /api/cv/profile (no CV uploaded)

Expected: 404 or empty response
```

---

### Postulations

#### Create Postulation - Valid
```
POST /api/postulations
{
  "offerId": "offer-001"
}

Expected: 201 with postulation object
```

#### Get All Postulations
```
GET /api/postulations

Expected: 200 with array of postulations
```

#### Match Postulation
```
POST /api/postulations/match
{
  "offerId": "offer-001"
}

Expected: 200 with match analysis
```

#### Generate Adapted CV
```
POST /api/postulations/:id/generate-cv

Expected: 200 with adapted CV content and ATS score
```

---

### Offers & Ranking

#### Get All Offers
```
GET /api/offers

Expected: 200 with array of offers
```

#### Get Ranked Offers
```
GET /api/offers/ranked

Expected: 200 with ranked offers sorted by score
```

---

### Learning System

#### Report Outcome - Interview
```
POST /api/learning/outcome
{
  "postulationId": "post-123",
  "outcome": "interview",
  "feedback": "Interviewer asked about experience"
}

Expected: 200 with success message
```

#### Get Memory Summary
```
GET /api/learning/summary

Expected: 200 with summary object
```

#### Export Memory
```
GET /api/learning/export

Expected: 200 with JSON export
```

---

## Known Issues to Test

1. **Missing Environment Variables**
   - ANTHROPIC_API_KEY not set?
   - Database path issues?

2. **Agent Invocation**
   - Are agents being called correctly?
   - Are responses being parsed correctly?

3. **Database**
   - Is schema being initialized?
   - Are transactions working?

4. **Auth**
   - Token expiration?
   - Refresh token logic?

5. **Validation**
   - Input validation on all endpoints?
   - Error messages clear?

6. **CORS**
   - Frontend (localhost:5173) can access backend?

---

## Bugs Found

(To be updated as testing proceeds)

### Critical Bugs
- None found yet

### High Priority Bugs
- None found yet

### Medium Priority Bugs
- None found yet

### Low Priority Bugs
- None found yet

---

## Testing Progress

- [ ] Auth endpoints
- [ ] CV endpoints
- [ ] Postulation endpoints
- [ ] Offers endpoints
- [ ] Learning endpoints
- [ ] Edge cases
- [ ] Error handling
- [ ] Performance
- [ ] Security

---

## Environment Setup

**Backend:**
- URL: http://localhost:3000
- Database: SQLite (./fitcv.db)
- Log level: debug

**Frontend:**
- URL: http://localhost:5173
- API_URL: http://localhost:3000/api

**Environment Variables:**
- ANTHROPIC_API_KEY: [needs to be set]
- JWT_SECRET: [needs to be set]
- DATABASE_URL: [needs to be set]

---

## Test Results

(To be updated after each test run)

### Status: PENDING

Waiting for server to start...

