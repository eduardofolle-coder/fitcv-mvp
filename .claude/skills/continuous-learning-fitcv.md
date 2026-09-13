---
name: continuous-learning-fitcv
description: Framework for FITCV to learn from successful postulations and improve recommendations over time
---

# Continuous Learning Framework for FITCV

## When to Use

When:
- A postulation results in an interview/offer (success signal)
- A CV adaptation produces high ATS score + user gets interview
- User reports a successful application outcome
- Building agent prompts that reference learned patterns

This framework enables FITCV to become smarter over time by learning what works.

---

## Learning Loop

```
User applies to job
    ↓
CV is adapted (ATS score recorded)
    ↓
User reports outcome (interview, rejection, offer)
    ↓
✅ SUCCESS: Save pattern to memory vault
    ↓
Future agents consult memory
    ↓
Better recommendations based on learned patterns
```

---

## What to Remember

### 1. Successful CV Adaptations

**When:** User reports interview/offer after postulation

**What to Save:**
```json
{
  "id": "pattern-successful-cv-001",
  "type": "successful_cv_adaptation",
  "jobTitle": "Senior Backend Engineer",
  "company": "TechCorp",
  "candidateLevel": "L5",
  "matchScore": 92,
  "atsScore": 88,
  "keywords": ["Kubernetes", "Python", "AWS", "Microservices"],
  "cvSections": {
    "summary": "What resonated: Led with specific tech stack",
    "experience": "Key achievement: Quantified impact (60% latency)",
    "skills": "Organization: Grouped by relevance to role"
  },
  "outcome": "interview",
  "timeToOutcome": "3 days",
  "notes": "Emphasizing team leadership + technical depth worked well"
}
```

**Why:** Agents can reference what worked for similar candidates

**Use Case:**
- New candidate applying to similar role?
- Suggest same CV adaptation strategy
- Increase likelihood of interview

---

### 2. User's Skill Growth

**When:** Track improvements in candidate's profile over time

**What to Save:**
```json
{
  "id": "insight-skill-growth-001",
  "type": "skill_growth",
  "userId": "user-123",
  "skill": "Kubernetes",
  "timeline": [
    {
      "date": "2026-08-01",
      "proficiency": "beginner",
      "evidence": "First K8s project at TechCorp"
    },
    {
      "date": "2026-09-01",
      "proficiency": "intermediate",
      "evidence": "Led K8s migration for 50+ microservices"
    },
    {
      "date": "2026-09-12",
      "proficiency": "expert",
      "evidence": "Kubernetes certified + 5 projects"
    }
  ],
  "recommendations": "Highlight K8s expertise in future CVs - it's now a strength"
}
```

**Why:** Agents know which skills are new vs established

**Use Case:**
- User develops new skill (Rust, Kubernetes, etc.)
- Agents automatically emphasize it in future adaptations
- Match scores improve for roles requiring that skill

---

### 3. Job Market Patterns (by Location/Level)

**When:** Aggregate data from multiple successful outcomes

**What to Save:**
```json
{
  "id": "insight-market-chile-001",
  "type": "market_patterns",
  "location": "Chile",
  "jobLevel": "L5",
  "period": "2026-09",
  "patterns": {
    "averageSalary": 180000,
    "salaryCurrency": "CLP",
    "topCompanies": [
      {"name": "TechCorp", "positionsAvailable": 5, "averageSalary": 185000},
      {"name": "StartupXYZ", "positionsAvailable": 2, "averageSalary": 140000}
    ],
    "inDemandSkills": [
      {"skill": "Python", "frequency": 0.95},
      {"skill": "Kubernetes", "frequency": 0.85},
      {"skill": "AWS", "frequency": 0.80}
    ],
    "interviewRate": 0.45,
    "offerRate": 0.25
  }
}
```

**Why:** Help users understand market context

**Use Case:**
- User wondering if salary is competitive?
- Market data shows average for L5 in Chile
- Data-driven negotiation
- Focus on in-demand skills (0.95 frequency = almost all jobs)

---

### 4. Company-Specific Insights

**When:** User has multiple interactions with same company

**What to Save:**
```json
{
  "id": "insight-company-techcorp-001",
  "type": "company_insights",
  "company": "TechCorp",
  "insightsCount": 3,
  "patterns": {
    "typicalInterviewProcess": [
      "Phone screen (30 min, culture fit)",
      "Technical interview (60 min, system design)",
      "Team meeting (45 min, collaboration)"
    ],
    "valuedSkills": ["Microservices", "Kubernetes", "Communication"],
    "redFlags": ["Asked about competing offers", "Discussed equity structure"],
    "cultureFit": "Fast-paced startup, emphasis on autonomy",
    "successRate": 0.75,
    "interviewsCount": 4,
    "offersCount": 3
  },
  "userNotes": "They value full-stack thinking. Show multiple dimensions."
}
```

**Why:** Help candidates prepare for company-specific interviews

**Use Case:**
- User applying to TechCorp again?
- System says: "TechCorp typically asks about system design"
- User can prepare accordingly
- Success rate: 75% (higher than average 25%)

---

### 5. Personal Success Heuristics

**When:** Identify what works for THIS specific user

**What to Save:**
```json
{
  "id": "insight-personal-heuristics-001",
  "type": "personal_success_heuristics",
  "userId": "user-123",
  "heuristics": [
    {
      "principle": "Emphasize metrics over tasks",
      "evidence": 3,
      "successRate": 0.90,
      "example": "Instead of 'managed deployment', say 'reduced deployment time 60%'"
    },
    {
      "principle": "Lead with team leadership experience",
      "evidence": 2,
      "successRate": 0.85,
      "example": "Senior roles value mentoring + scaling teams"
    },
    {
      "principle": "Match job level, not just skills",
      "evidence": 5,
      "successRate": 0.80,
      "example": "L5 role requires strategic thinking, not just execution"
    }
  ],
  "recommendation": "When adapting CVs, prioritize: metrics > leadership > growth. This combo works 85%+ for you."
}
```

**Why:** Personalized recommendations based on what actually works for this user

**Use Case:**
- Next CV adaptation: system says
- "Based on your success pattern, lead with 3 quantified achievements"
- User applies same approach → higher success rate

---

## How Agents Use Memory

### Agent: cv-analyzer
**Consults Memory For:**
- Similar CVs from candidates who got interviews
- Successful CV structures by job level
- Industry-specific conventions

**Example:**
```
User uploads CV for L5 Backend role
System finds: "Similar successful CVs emphasize architecture decisions + team scale"
Agent suggests: "Add section on architectural decisions you've made"
```

### Agent: postulation-matcher
**Consults Memory For:**
- What match scores preceded interviews
- Gap closure timelines that worked
- Company-specific success rates

**Example:**
```
User matches to TechCorp role (match score: 82)
System finds: "82-85 range at TechCorp = 70% interview rate"
Agent says: "Good fit. This range has succeeded here before."
```

### Agent: cv-adapter
**Consults Memory For:**
- Successful adaptations for similar roles
- High ATS score patterns
- What keyword combinations work

**Example:**
```
User adapts CV for Senior Backend role
System finds: "Successful adaptations for this role emphasize: systems design + team impact"
Agent prioritizes those sections
Result: Higher ATS score (based on learned patterns)
```

### Agent: offer-ranker
**Consults Memory For:**
- Company success rates (who has good interview rate?)
- Market patterns (this salary range typical?)
- User's previous success patterns

**Example:**
```
User has 3 offers to evaluate
System finds:
  - TechCorp: 75% interview rate, 60% offer rate (proven winner)
  - StartupXYZ: 30% interview rate, 10% offer rate (risky)
  - CorporateCorp: 45% interview rate, 20% offer rate (safe)
Agent ranks: TechCorp #1 (historical success)
```

---

## Learning Triggers

### When to Save Learning

| Trigger | What to Save | Why |
|---------|------------|-----|
| User reports interview | CV adaptation that led to interview | Proven successful pattern |
| User reports offer | Full hiring process data | High confidence signal |
| User reports rejection + feedback | What didn't work + why | Learn from failures too |
| User completes 3+ months | Skill growth trajectory | Show improvement over time |
| Market data changes | New salary ranges, in-demand skills | Keep market insights current |
| Company interview feedback | Interview process, success rate | Prepare future candidates |

### What NOT to Save

❌ Don't save:
- Personally identifiable information (only aggregate)
- Rejected candidates' details (privacy)
- Salary negotiation tactics (confidential)
- Internal company information (confidential)
- Feedback that violates user privacy

✅ Do save:
- Aggregate patterns (this range works)
- General process info (typical interview flow)
- User's own success patterns
- Public market data

---

## Memory Vault Structure

```
~/.claude/projects/fitcv-mvp/memory/

├── MEMORY.md (index)
│
├── patterns/
│   ├── successful-cv-adaptations.md
│   ├── skill-growth-timeline.md
│   └── company-insights.md
│
├── market/
│   ├── market-chile-2026-09.md
│   ├── salary-trends.md
│   └── in-demand-skills.md
│
├── insights/
│   ├── personal-heuristics.md
│   ├── user-preferences.md
│   └── agent-performance.md
│
└── feedback/
    ├── interview-outcomes.md
    ├── rejection-reasons.md
    └── success-factors.md
```

Each file is:
- Markdown with YAML frontmatter
- Accessible to agents as context
- Updateable by continuous learning hooks
- Queryable by agent prompts

---

## Implementation Checklist

When implementing continuous learning:

- [ ] Database table: `learning_records` (track what was learned)
- [ ] Database table: `success_outcomes` (user reports results)
- [ ] Endpoint: `POST /api/postulations/:id/outcome` (user reports success/failure)
- [ ] Hook: After successful outcome, save pattern to memory
- [ ] Service: `MemoryVaultService` (read/write to memory files)
- [ ] Agent prompts: Include memory consultation
- [ ] Endpoint: `GET /api/insights` (user sees what system learned)
- [ ] Cleanup: Archive old patterns (>1 year, no evidence)

---

## Privacy & Consent

**Golden Rule:** Only learn from data you own

✅ **Always save:**
- User's own patterns (their adaptations, outcomes)
- Their reported success factors
- Their skill growth

❌ **Never save:**
- Other candidates' personal data
- Company confidential info
- Salary negotiation details

**User Control:**
- Users can opt-out of learning (flag in preferences)
- Users can review what system learned about them
- Users can delete patterns at any time
- Clear privacy policy on what gets saved

---

## Expected Benefits

### Short Term (Weeks 1-4)
- System knows user's success patterns
- Agents provide personalized recommendations
- User sees what worked for them

### Medium Term (Months 1-3)
- Collect data on 10-20 outcomes
- Market patterns become visible
- Company-specific insights emerge
- 10-20% improvement in match accuracy

### Long Term (Months 3+)
- Deep learning on user's career trajectory
- Predictive success rates for opportunities
- Personalized skill growth recommendations
- Agents actively improve with each user interaction

---

## Success Metrics

Track continuous learning effectiveness:

```
Metric                              Target
────────────────────────────────────────────
Interview rate for matched roles    > 40% (from 30%)
Time to first interview              ↓ 30% (from 7 days → 5 days)
Offer acceptance rate               > 70% (from 50%)
User satisfaction                   > 4.5/5
Agent recommendation quality        ↑ 25%
```

If metrics improve, learning is working ✅
If metrics plateau, adjust learning rules 🔄

---

## Example: Full Learning Cycle

```
Sept 1: John applies to role
        ↓
        CV adapted with ATS: 88
        Match score: 92
        Saved to memory vault

Sept 5: John reports: "Got interview!"
        ↓
        Trigger: Save successful pattern
        Pattern saved: "This CV structure + keywords = interview at this company"
        
Sept 12: Agents consult memory
         New user applies to similar role
         Agent finds: "92+ match scores get interviews 70% of time"
         Agent recommends: "Strong fit, use similar CV approach"
         
Sept 15: New user applies
         Gets interview (pattern worked again!)
         
Sept 20: Next user benefits from data from 2+ successful cases
         Learning compounds over time → continuous improvement
```

---

## Continuous Improvement Loop

```
Collect → Analyze → Learn → Recommend → Verify → Repeat
```

1. **Collect:** User reports outcome
2. **Analyze:** What patterns led to success?
3. **Learn:** Save pattern to memory
4. **Recommend:** Next user gets better advice based on pattern
5. **Verify:** Did recommendation help? Check outcomes
6. **Repeat:** Continuously improve

This cycle turns FITCV from reactive (find jobs) to proactive (learn what works for YOU).
