---
name: cv-matching-framework
description: Framework for scoring CV-to-job fit using consistent metrics and weights
---

# CV Matching Framework Skill

## When to Use

When implementing or improving:
- Job matching algorithms
- Candidate scoring systems
- Opportunity ranking logic
- CV adaptation strategies

This skill standardizes how FITCV agents evaluate candidate-to-opportunity fit.

---

## Core Metrics

### Skills Fit Score (0-100)

Measure: How well candidate's skills match job requirements

**Scoring Rubric:**
- **90-100:** Has all/most required skills with strong evidence
  - All critical skills present
  - Most important skills at intermediate+ proficiency
  - Some preferred skills also present
  
- **70-89:** Has most required skills, missing 1-2 minor ones
  - 80%+ of critical skills present
  - Can fill minor gaps quickly
  - Good foundation for role

- **50-69:** Has some required skills, meaningful gaps exist
  - 60-79% of critical skills present
  - Significant learning curve but doable
  - Would require onboarding support

- **30-49:** Has few required skills, major gaps
  - <60% of critical skills present
  - High risk hire, needs significant training
  - May not be job-ready

- **0-29:** Missing most required skills
  - Fundamentally misaligned
  - Not recommended without major upskilling

**Implementation:**
```
criticalSkillsFound / totalCriticalSkills * 100 = base score
Apply modifiers:
+ Bonus if has preferred skills (up to +15 points)
- Penalty if has conflicting "legacy" tech (up to -10 points)
```

---

### Experience Match Score (0-100)

Measure: Years and domain relevance vs. requirements

**Scoring Rubric:**
- **90-100:** Experience exceeds requirements, deep domain expertise
  - 120%+ of required years in field
  - Multiple years in specific domain
  - Proven track record in similar roles

- **70-89:** Experience meets or slightly exceeds requirements
  - 100-120% of required years
  - Direct or very related domain
  - Solid background

- **50-69:** Experience close to requirements, some gaps
  - 70-99% of required years
  - Related domain but not exact
  - Trainable, needs onboarding

- **30-49:** Less experience than required
  - 50-69% of required years
  - May need mentoring and support
  - Career progression concern

- **0-29:** Far below required experience
  - <50% of required years
  - High risk, likely not ready

**Implementation:**
```
yearsInField = parseCareerHistory(resume)
yearsInDomain = yearsInField filtered by relevant companies/roles

If yearsInDomain >= requiredYears:
  score = MIN(100, (yearsInDomain / requiredYears) * 100)
Else:
  score = (yearsInDomain / requiredYears) * 100
```

---

### Education Match Score (0-100)

Measure: Degree level and field relevance

**Scoring Rubric:**
- **90-100:** Exact field match, higher degree than required
  - Bachelor+ in relevant CS field (CS, CE, Software Engineering, Math, Physics)
  - Or Master's/PhD regardless of field

- **70-89:** Related field, meets degree requirement
  - Degree in related field (Engineering, Math, Physics, related sciences)
  - Or bootcamp + relevant experience
  - Equivalent alternative credentials

- **50-69:** Somewhat related field, meets requirement
  - Degree in adjacent field (Business, Economics, Sciences)
  - Or strong self-taught background
  - Or bootcamp without strong experience

- **30-49:** Different field or missing degree
  - Different field but has strong experience
  - Or missing degree but has 5+ years relevant work
  - Or bootcamp + some experience

- **0-29:** Significant educational gap
  - No relevant degree or credentials
  - No compensating experience
  - Not typical for senior roles

**Implementation:**
```
degreeRelevance = mapDegree(candidateDegree, jobRequired)
// Maps: exact=100, related=75, adjacent=50, different=25, none=0

If candidate has alternative credentials (bootcamp, certifications):
  credentialBoost = 15-25 depending on relevance and experience
  score = MIN(100, degreeRelevance + credentialBoost)
Else:
  score = degreeRelevance
```

---

## Weighted Overall Match

**Formula:**
```
overallScore = (skillsFit * 0.35) + (experienceFit * 0.35) + (educationFit * 0.30)
```

Why these weights?
- Skills (35%): Most important for day-one capability
- Experience (35%): Proves real-world ability with problems at scale
- Education (30%): Foundation, but experience compensates

**Result Categories:**
- **85-100:** Exceptional fit - Strong hire, quick ramp
- **70-84:** Good fit - Solid candidate, reasonable ramp
- **55-69:** Moderate fit - Some gaps, needs training
- **40-54:** Weak fit - High risk, significant training needed
- **0-39:** Poor fit - Not recommended

---

## Gap Analysis

For each gap identified:

1. **Categorize:** Critical (must-have), Important (strongly preferred), Nice-to-have (optional)

2. **Time to Closure:** How long to close?
   - Quick (1-2 weeks): Can learn on job, bootcamp/cert available
   - Medium (1-3 months): Needs structured learning + practice
   - Long (3-6 months): Requires significant training program
   - Very Long (6+ months): Needs extensive experience or mentoring

3. **Risk Assessment:**
   - Low: Can be trained quickly, doesn't block productivity
   - Medium: Important but learnable, impacts initial productivity
   - High: Critical skill missing, significant risk if not addressed
   - Critical: Makes candidate unsuitable without this skill

---

## Implementation Checklist

When scoring a candidate:

- [ ] Extract all skills from CV (explicitly stated)
- [ ] Parse job requirements clearly
- [ ] Identify critical vs preferred requirements
- [ ] Score skills match based on rubric
- [ ] Count years of experience accurately
- [ ] Score experience match based on domain relevance
- [ ] Extract education and score relevance
- [ ] Calculate weighted overall score
- [ ] Identify and categorize gaps
- [ ] Estimate time to closure for each gap
- [ ] Provide risk assessment
- [ ] Always explain reasoning with evidence

---

## Anti-Patterns to Avoid

❌ **Don't:**
- Assume transferable skills without evidence
- Penalize for learning older tech when current is known
- Value credentials over demonstrated ability
- Score education too highly
- Miss implicit skills (leadership, architecture, teaching)
- Ignore role-specific considerations (startup vs enterprise, etc.)

✅ **Do:**
- Look for evidence in projects and achievements
- Weight recent experience more heavily
- Consider alternative credentials (bootcamps, self-taught)
- Focus on ability to learn and grow
- Look for patterns (does candidate learn new stacks quickly?)
- Adjust weights if industry-standard differs

---

## Examples

### Example 1: Perfect Match
```
Candidate: 8 years Python backend, Kubernetes expert, CS degree
Job: Senior Backend Engineer, 5+ years required

skillsFit: 95 (has all required: Python, K8s, databases, AWS)
experienceFit: 95 (8 years exceeds 5 required, deep domain)
educationFit: 100 (CS degree, exact field)
overallScore: (95*0.35) + (95*0.35) + (100*0.30) = 96.5
Verdict: Exceptional fit
```

### Example 2: Good Fit with Minor Gap
```
Candidate: 6 years backend (Python + Go), K8s intermediate, CS degree
Job: Senior Backend Engineer, wants Python AND Go

skillsFit: 85 (has most skills, K8s is intermediate not expert)
experienceFit: 88 (6 years meets requirement, good domain)
educationFit: 100 (CS degree)
overallScore: (85*0.35) + (88*0.35) + (100*0.30) = 90.2
Verdict: Strong fit, gap is learnable
Gap: K8s expertise (time: 2-4 weeks, risk: low)
```

### Example 3: Weak Fit
```
Candidate: 2 years junior developer (JavaScript), CS degree
Job: Senior Backend Engineer, 5+ years Python required

skillsFit: 35 (has programming but not Python or backend)
experienceFit: 20 (2 years << 5 required, wrong domain)
educationFit: 100 (CS degree)
overallScore: (35*0.35) + (20*0.35) + (100*0.30) = 42.75
Verdict: Poor fit - significant training needed
Recommendation: Not suitable for senior role
```

---

## Continuous Improvement

Track scoring accuracy:
- When candidate is hired, did they succeed?
- Was match score predictive?
- Which gaps proved easiest/hardest to close?
- Adjust weights if needed based on real outcomes

Use this feedback to improve the framework over time.
