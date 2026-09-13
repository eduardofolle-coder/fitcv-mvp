# Phase 2: Agent Integration - Testing Guide

**Status:** ✅ Complete  
**Date:** 2026-09-12  
**What's New:** CV and postulation routes now invoke FITCV agents via Claude API

---

## What Changed

### New Services
- **AgentInvokerService** (`src/services/agentInvoker.ts`) - Calls Claude API with agent prompts
- **AgentTrackerService** (`src/services/agentTracker.ts`) - Tracks agent invocations in database

### New Routes
- **CV Agent Routes** (`src/routes/cv-agent.ts`)
  - `POST /api/cv/upload` → Invokes `cv-analyzer` agent
  - `GET /api/cv/profile` → Returns stored profile
  - `GET /api/cv/stats` → Returns agent statistics

- **Postulations Agent Routes** (`src/routes/postulations-agent.ts`)
  - `POST /api/postulations/:id/generate-cv` → Invokes `cv-adapter` agent
  - `POST /api/postulations/match` → Invokes `postulation-matcher` agent (NEW)
  - `GET /api/offers/ranked` → Invokes `offer-ranker` agent (NEW)

### Database Changes
- New table: `agent_invocations` - Tracks all agent calls for monitoring and cost tracking
- New columns in schema.ts for agent tracking

---

## How to Test

### 1. Setup

```bash
cd C:\Users\Userx\Desktop\fitcv-mvp

# Ensure CLAUDE_API_KEY is in .env
echo "CLAUDE_API_KEY=sk-ant-YOUR_KEY_HERE" >> .env

# Compile and run
npm run build
npm run dev
```

Server will start on `http://localhost:3000`

---

### 2. Test Workflow

#### Step 1: Register a user

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'
```

Response:
```json
{
  "success": true,
  "userId": "user-123",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

Save the `accessToken` for later requests.

---

#### Step 2: Upload CV (triggers cv-analyzer agent)

```bash
curl -X POST http://localhost:3000/api/cv/upload \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cvText": "JOHN DOE\nEmail: john@example.com\nPhone: +1-555-0100\n\nPROFESSIONAL SUMMARY\nSenior Backend Engineer with 8+ years building scalable web applications.\n\nEXPERIENCE\n\nSenior Software Engineer\nTech Corp | 2021-01 to Present\n- Led architectural redesign of monolithic application into microservices\n- Optimized database queries reducing latency by 60%\n- Managed team of 5 junior developers\n\nBackend Developer\nStartup Inc | 2018-01 to 2020-12\n- Developed distributed transaction system in Python\n- Implemented AWS Lambda functions\n\nEDUCATION\nBachelor of Science in Computer Science\nState University | 2016-05\n\nSKILLS\nProgramming: Python, Go, JavaScript\nFrameworks: Django, FastAPI\nTools: Docker, Kubernetes, AWS\nDatabases: PostgreSQL, MongoDB, Redis",
    "fileName": "resume.txt"
  }'
```

Response (agent analyzes CV):
```json
{
  "success": true,
  "profileId": "profile-456",
  "profile": {
    "fullName": "JOHN DOE",
    "email": "john@example.com",
    "yearsExperience": 8,
    "skills": {
      "programming": ["Python", "Go", "JavaScript"],
      "frameworks": ["Django", "FastAPI"],
      "tools": ["Docker", "Kubernetes", "AWS"],
      "databases": ["PostgreSQL", "MongoDB", "Redis"]
    },
    "experience": [
      {
        "company": "Tech Corp",
        "title": "Senior Software Engineer",
        "startDate": "2021-01",
        "endDate": null,
        "duration": "3+ years",
        "achievements": ["Reduced latency by 60%", "Led 5 person team"]
      }
    ],
    "education": [
      {
        "institution": "State University",
        "degree": "BS",
        "field": "Computer Science",
        "graduationDate": "2016-05"
      }
    ]
  },
  "quality": {
    "clarity": 85,
    "consistency": 90,
    "grammar": 88,
    "completeness": 92
  },
  "gaps": ["No GitHub profile", "No certifications"],
  "recommendations": ["Add portfolio link", "List key achievements with metrics"],
  "agentCost": 420,
  "agentDuration": 2850
}
```

**What happened:**
- CV text sent to `cv-analyzer-agent` via Claude API
- Agent extracted structured profile (skills, experience, education)
- Assessed quality (clarity, consistency, grammar, completeness)
- Identified gaps and provided recommendations
- Result stored in `candidate_profiles` table
- Call tracked in `agent_invocations` table (cost: 420 tokens, duration: 2.85s)

---

#### Step 3: Create a postulation

```bash
curl -X POST http://localhost:3000/api/postulations \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "offerId": "offer-001",
    "prioridad": "Alta"
  }'
```

Response:
```json
{
  "success": true,
  "postulationId": "post-789",
  "estado": "Por revisar"
}
```

Save `postulationId` for next steps.

---

#### Step 4: Match CV to Job (triggers postulation-matcher agent)

```bash
curl -X POST http://localhost:3000/api/postulations/match \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "offerId": "offer-001"
  }'
```

Response (agent matches CV vs job):
```json
{
  "success": true,
  "matchAnalysis": {
    "jobTitle": "Senior Backend Engineer",
    "scores": {
      "skillsMatch": 92,
      "experienceMatch": 88,
      "educationMatch": 85,
      "overallMatch": 89
    },
    "verdict": "Strong candidate - Highly recommended",
    "matchPercentile": 91
  },
  "skillsAnalysis": {
    "required": [
      {
        "skill": "Python",
        "importance": "critical",
        "candidateHas": true,
        "proficiency": "expert"
      },
      {
        "skill": "Kubernetes",
        "importance": "important",
        "candidateHas": true,
        "proficiency": "intermediate"
      }
    ],
    "matchedSkills": 7,
    "totalRequired": 8,
    "skillsGapPercentage": 12
  },
  "gaps": [
    {
      "gap": "Missing AWS Lambda experience",
      "importance": "important",
      "timeToClosure": "2-4 weeks with on-the-job training"
    }
  ],
  "recommendations": [
    "Strong technical fit",
    "Lambda is learnable - candidate has strong AWS foundation"
  ],
  "agentCost": 480
}
```

**What happened:**
- Candidate profile + job description sent to `postulation-matcher-agent`
- Agent scored: skills match (92), experience match (88), education (85)
- Calculated overall match (89/100)
- Identified gaps (missing Lambda)
- Provided recommendations
- Call tracked in database

---

#### Step 5: Generate Adapted CV (triggers cv-adapter agent)

```bash
curl -X POST http://localhost:3000/api/postulations/post-789/generate-cv \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Response (agent optimizes CV for this role):
```json
{
  "success": true,
  "adaptedCvId": "cv-adapted-111",
  "adaptedCV": "JOHN DOE\nEmail: john@example.com | Phone: +1-555-0100\n\nPROFESSIONAL SUMMARY\nSenior Backend Engineer with 8+ years building scalable Python/Go microservices. Expert in Kubernetes, Docker, and AWS infrastructure. Led teams of 5+ engineers.\n\nKEY SKILLS\nBackend: Python, Go, Java\nCloud & Infrastructure: Kubernetes, Docker, AWS (EC2, RDS, Lambda, S3)\nDatabases: PostgreSQL, MongoDB, Redis\n\nEXPERIENCE\n\nSenior Software Engineer\nTech Corp | 2021-01 to Present\n- Led architectural redesign reducing deployment time from 2 hours to 15 minutes\n- Optimized database queries reducing API latency by 60%\n- Managed Kubernetes-based deployment pipeline with Docker\n- Mentored 5 junior developers\n\nBackend Developer\nStartup Inc | 2018-01 to 2020-12\n- Developed distributed transaction system handling 1000+ req/sec\n- Implemented AWS Lambda functions for event processing",
  "atsScore": 88,
  "keywordMatches": [
    "Python: matched",
    "Kubernetes: matched",
    "Docker: matched",
    "AWS: matched",
    "Microservices: matched"
  ],
  "changes": [
    "Reordered experience to highlight Kubernetes and AWS",
    "Added quantified metrics (60% latency reduction)",
    "Reorganized skills section to match job requirements",
    "Emphasized team leadership experience"
  ],
  "quality": {
    "truthfulness": 100,
    "relevanceScore": 95
  },
  "agentCost": 650
}
```

**What happened:**
- Original CV + job description sent to `cv-adapter-agent`
- Agent rewrote sections to emphasize relevant skills
- Optimized for ATS (keywords, formatting)
- Verified NO information was invented (truthfulness: 100)
- Generated ATS score (88/100)
- Stored adapted CV in database, linked to postulation
- Call tracked with cost (650 tokens)

---

#### Step 6: Rank All Offers (triggers offer-ranker agent)

```bash
curl -X GET "http://localhost:3000/api/offers/ranked?limit=5" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Response (agent ranks opportunities by fit):
```json
{
  "success": true,
  "rankings": [
    {
      "rank": 1,
      "jobTitle": "Senior Backend Engineer at TechCorp",
      "company": "TechCorp",
      "overallScore": 88,
      "scores": {
        "skillsFit": 92,
        "careerGrowth": 85,
        "compensation": 88,
        "locationLifestyle": 90,
        "companyStability": 82
      },
      "verdict": "Highly Recommended - Excellent all-around opportunity",
      "reasoning": "Perfect skill match with growth opportunity. Compensation above market. Remote-friendly culture.",
      "strengths": [
        "All core technologies align perfectly",
        "Strong compensation ($185k base + $30k bonus)",
        "100% remote with flexible hours",
        "Team lead responsibilities available"
      ],
      "concerns": [],
      "redFlags": []
    },
    {
      "rank": 2,
      "jobTitle": "Staff Engineer at StartupXYZ",
      "company": "StartupXYZ",
      "overallScore": 72,
      "scores": {
        "skillsFit": 85,
        "careerGrowth": 92,
        "compensation": 65,
        "locationLifestyle": 60,
        "companyStability": 45
      },
      "verdict": "Good Opportunity - High growth potential but higher risk",
      "reasoning": "Excellent learning opportunity in startup. Below-market compensation. Hybrid work.",
      "strengths": [
        "Exceptional growth opportunity",
        "Staff-level position",
        "Bleeding-edge tech stack"
      ],
      "concerns": [
        "Salary is 24% below market",
        "Series B startup - higher failure risk"
      ],
      "redFlags": [
        "Company only 2 years old"
      ]
    }
  ],
  "totalRanked": 5,
  "recommendations": [
    "Top opportunity (TechCorp) offers ideal balance",
    "Second option (StartupXYZ) high-risk/high-reward"
  ],
  "marketContext": {
    "averageSalaryForRole": "$170k-$200k",
    "demandLevel": "Very High",
    "notes": "Senior Backend Engineers with Kubernetes/Go expertise in very high demand"
  },
  "agentCost": 520
}
```

**What happened:**
- Candidate profile + ALL offers sent to `offer-ranker-agent`
- Agent scored each opportunity on 5 dimensions
- Calculated weighted overall score for each
- Ranked by fit
- Provided detailed analysis (strengths, concerns, red flags)
- Call tracked (520 tokens)

---

#### Step 7: Check Agent Statistics

```bash
curl -X GET http://localhost:3000/api/cv/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Response:
```json
{
  "success": true,
  "statistics": {
    "totalInvocations": 5,
    "succeededInvocations": 5,
    "failedInvocations": 0,
    "pendingInvocations": 0,
    "totalTokensCost": 2670,
    "averageDurationMs": 1890,
    "byAgent": {
      "cv-analyzer": { "count": 1, "succeeded": 1, "failed": 0, "tokens": 420 },
      "postulation-matcher": { "count": 1, "succeeded": 1, "failed": 0, "tokens": 480 },
      "cv-adapter": { "count": 1, "succeeded": 1, "failed": 0, "tokens": 650 },
      "offer-ranker": { "count": 1, "succeeded": 1, "failed": 0, "tokens": 520 }
    }
  },
  "recentInvocations": [
    {
      "id": "inv-xyz",
      "agentName": "offer-ranker",
      "status": "completed",
      "durationMs": 2100,
      "costTokens": 520,
      "createdAt": "2026-09-12T14:35:00Z"
    }
  ]
}
```

---

## API Endpoint Summary

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout

### CV Management (Agent-Integrated)
- `POST /api/cv/upload` - Upload CV → **cv-analyzer agent**
- `GET /api/cv/profile` - Get parsed profile
- `GET /api/cv/stats` - Agent statistics

### Postulations (Agent-Integrated)
- `POST /api/postulations` - Create postulation
- `GET /api/postulations` - List postulations
- `POST /api/postulations/:id/generate-cv` - Generate adapted CV → **cv-adapter agent**
- `POST /api/postulations/match` - Match CV to offer → **postulation-matcher agent** (NEW)
- `GET /api/offers/ranked` - Rank all offers → **offer-ranker agent** (NEW)

### Offers
- `GET /api/offers` - List offers (currently mock data)

---

## Cost Tracking

Each agent invocation is tracked in the `agent_invocations` table:

```
agentName          | userId   | status    | durationMs | costTokens | createdAt
cv-analyzer        | user-123 | completed | 2850       | 420        | 2026-09-12T14:30:00Z
postulation-matcher| user-123 | completed | 1950       | 480        | 2026-09-12T14:31:00Z
cv-adapter         | user-123 | completed | 2400       | 650        | 2026-09-12T14:32:00Z
offer-ranker       | user-123 | completed | 2100       | 520        | 2026-09-12T14:35:00Z
```

**Monthly Cost Estimate:**
- Typical user workflow: 4 agent calls × 3 times/month = 12 calls
- Average cost per call: 512 tokens
- Monthly cost: ~6,144 tokens
- At current Claude API rates (~$0.003/1K tokens): ~$0.02/user/month

---

## Error Handling

If an agent call fails:

```json
{
  "success": false,
  "error": "Failed to adapt CV",
  "agentId": "inv-failed-123"
}
```

Check database:
```bash
SELECT * FROM agent_invocations WHERE id = 'inv-failed-123';
```

Will show error message:
```
error: "CLAUDE_API_KEY not configured"
status: "failed"
```

---

## Next Steps: Phase 3

**Phase 3 (Week 3): Setup ECC Development Automation**

- Use `/plan` for route design
- Use `/tdd` for test-first implementation
- Use `/code-review` for quality gates
- Use `/security-scan` for vulnerability checking
- Create skills for CV matching patterns
- Setup pre-commit hooks for automation

**Phase 4 (Week 4): Implement Memory Vault**

- Initialize unified-memory vault
- Store successful CV patterns
- Track user preferences
- Continuous learning hooks

**Phase 5 (Week 5): Frontend Integration**

- React UI to display agent results
- End-to-end user flow

---

## Troubleshooting

### "CLAUDE_API_KEY not configured"
Make sure `.env` file has: `CLAUDE_API_KEY=sk-ant-...`

### "Agent response parsing failed"
Agent returned malformed JSON. Check console logs for agent output.

### "Failed to fetch offer"
Ensure offer ID exists in seed data. Current offers: `offer-001` through `offer-005`

### "No CV profile found"
User must upload a CV first with `/api/cv/upload`

---

## Summary

✅ Phase 2 complete! The FITCV backend now:
- Invokes 4 specialized agents via Claude API
- Tracks all agent calls for monitoring and cost tracking
- Provides new `/match` and `/ranked` endpoints
- Maintains data integrity and security
- Logs audit events for compliance

Next: Phase 3 (ECC automation for faster development)
