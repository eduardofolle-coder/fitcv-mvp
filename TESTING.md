# FITCV Backend Testing Guide

**Versión:** MVP v0.2  
**Date:** 2026-09-08

---

## Quick Start

```bash
# Terminal 1: Start server
cd C:\Users\Userx\Desktop\fitcv-mvp
npm run dev

# Terminal 2: Run tests (copy-paste commands below)
```

Server will be available at: `http://localhost:3000`

---

## Test Flow (End-to-End)

### Step 1: Register User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

**Expected:** Status 201 with accessToken

**Save the accessToken** for next steps. Let's call it `$TOKEN`

---

### Step 2: Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

**Expected:** Status 200 with accessToken (may differ from register)

---

### Step 3: Upload & Analyze CV

Replace `$TOKEN` with the actual token from Step 1.

```bash
curl -X POST http://localhost:3000/api/cv/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cvContent": "Juan Pérez\n8 years experience as Data Analyst\n\nEducation:\n- BS Computer Science, Universidad de Chile\n- Data Science Certification, Coursera\n\nSkills:\n- Python (expert)\n- SQL (expert)\n- AWS (intermediate)\n- Tableau (intermediate)\n- ETL pipelines\n- Statistics\n- Machine Learning basics\n\nExperience:\n- Senior Data Analyst at Amazon (2020-2025)\n  * Led analytics team\n  * Built ETL pipelines\n  * Developed dashboards\n  * Mentored junior analysts\n\n- Data Analyst at Google (2018-2020)\n  * Analyzed user behavior\n  * Created reports\n  * Optimized queries\n\n- Junior Data Analyst at Microsoft (2017-2018)\n  * First role in analytics\n  * Built dashboards\n  * Learned SQL",
    "fullName": "Juan Pérez"
  }'
```

**Expected:** Status 200 with:
- `profileId` (save for later)
- Full profile analysis (name, experience, skills, education, summary)

**Save the profileId** for reference.

---

### Step 4: Get Profile

```bash
curl -X GET http://localhost:3000/api/cv/profile \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** Status 200 with profile data (matches Step 3 output)

---

### Step 5: Get Role Suggestions

```bash
curl -X POST http://localhost:3000/api/cv/suggest-roles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected:** Status 200 with array of suggested roles:
- Each role has: title, level (L1-L6), matchScore, description

**Note:** This calls Claude API, may take 5-10 seconds

---

### Step 6: List Suggested Roles

```bash
curl -X GET http://localhost:3000/api/cv/roles \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** Status 200 with roles from Step 5

---

### Step 7: Select Roles

Get a roleId from Step 5 output, then:

```bash
curl -X POST http://localhost:3000/api/cv/select-roles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "roleIds": ["ROLE_ID_FROM_STEP_5"]
  }'
```

**Expected:** Status 200 with success message

---

### Step 8: List Job Offers

```bash
curl -X GET "http://localhost:3000/api/offers?limit=5" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** Status 200 with 5 mock job offers:
1. Senior Data Analyst (Amazon, L4)
2. Product Manager - Fintech (Cornershop, L4)
3. Growth Marketing Manager (Despegar, L3)
4. ML Engineer (NotCo, L4)
5. Business Analyst (Banco Estado, L2)

---

### Step 9: Get Offer Details

Use an offerId from Step 8:

```bash
curl -X GET http://localhost:3000/api/offers/OFFER_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** Status 200 with full offer details

---

### Step 10: Create Postulation

Use an offerId from Step 8:

```bash
curl -X POST http://localhost:3000/api/postulations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "offerId": "OFFER_ID",
    "estado": "Por revisar",
    "prioridad": "Alta",
    "notes": "Great fit for my experience"
  }'
```

**Expected:** Status 201 with:
- `postulationId`
- `postulationWeight` (1, 2, or 4 based on level)

**Save the postulationId**

---

### Step 11: List Postulations

```bash
curl -X GET http://localhost:3000/api/postulations \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** Status 200 with:
- Array of all user postulations
- Pagination info
- Job details (title, company, level, salary, etc.)

---

### Step 12: Get Postulation Details

Use postulationId from Step 10:

```bash
curl -X GET http://localhost:3000/api/postulations/POSTULATION_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** Status 200 with full postulation + job details + requirements

---

### Step 13: Generate Adapted CV

Use postulationId from Step 10:

```bash
curl -X POST http://localhost:3000/api/postulations/POSTULATION_ID/generate-cv \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected:** Status 200 with:
- `cvId`
- `atsScore` (0-100)
- `changes` (array of modifications made)
- `keywords` (top keywords used)

**Note:** Calls Claude API, takes 5-10 seconds

---

### Step 14: Download Adapted CV

Use postulationId from Step 10:

```bash
curl -X GET http://localhost:3000/api/postulations/POSTULATION_ID/cv \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** Status 200 with:
- `content` (adapted CV in plain text)
- `atsScore`
- `changes`
- `job` (title @ company)

---

### Step 15: Update Postulation

Use postulationId from Step 10:

```bash
curl -X PUT http://localhost:3000/api/postulations/POSTULATION_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "estado": "Aplicado",
    "prioridad": "Media",
    "notes": "Application submitted successfully"
  }'
```

**Expected:** Status 200 with success message

---

### Step 16: Get Dashboard Stats

```bash
curl -X GET http://localhost:3000/api/offers/stats/summary \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** Status 200 with:
- Total offers
- Offers by level
- Top companies
- User's postulations count

---

### Step 17: Test Filtering

```bash
# Filter offers by level
curl -X GET "http://localhost:3000/api/offers?level=L4" \
  -H "Authorization: Bearer $TOKEN"

# Filter postulations by estado
curl -X GET "http://localhost:3000/api/postulations?estado=Aplicado" \
  -H "Authorization: Bearer $TOKEN"

# Search offers
curl -X GET "http://localhost:3000/api/offers?search=Data" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** Status 200 with filtered results

---

### Step 18: Test Error Handling

#### Missing Token
```bash
curl -X GET http://localhost:3000/api/cv/profile
```
**Expected:** Status 401 with "No authentication token"

#### Invalid Postulation Data
```bash
curl -X POST http://localhost:3000/api/postulations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "offerId": "invalid-uuid"
  }'
```
**Expected:** Status 400 with validation errors

#### Non-existent Resource
```bash
curl -X GET http://localhost:3000/api/offers/nonexistent-id \
  -H "Authorization: Bearer $TOKEN"
```
**Expected:** Status 404 with "Job offer not found"

---

### Step 19: Test Rate Limiting

Make 6 login attempts within 15 minutes:

```bash
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "test@example.com", "password": "wrong"}'
  echo "\nAttempt $i"
done
```

**Expected:** On 6th attempt, Status 429 with "Too many login attempts"

---

### Step 20: Delete Postulation

Use postulationId from Step 10:

```bash
curl -X DELETE http://localhost:3000/api/postulations/POSTULATION_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** Status 200 with success message

---

## Test Results Checklist

- [ ] Step 1: Register successful
- [ ] Step 2: Login successful
- [ ] Step 3: CV upload & analysis successful
- [ ] Step 4: Get profile successful
- [ ] Step 5: Role suggestions generated
- [ ] Step 6: List roles successful
- [ ] Step 7: Select roles successful
- [ ] Step 8: List offers successful (5 mock offers visible)
- [ ] Step 9: Get offer details successful
- [ ] Step 10: Create postulation successful
- [ ] Step 11: List postulations shows created postulation
- [ ] Step 12: Get postulation details successful
- [ ] Step 13: Generate adapted CV successful (has ATS score)
- [ ] Step 14: Download CV successful (has changes & keywords)
- [ ] Step 15: Update postulation successful
- [ ] Step 16: Dashboard stats successful
- [ ] Step 17: Filtering works (level, estado, search)
- [ ] Step 18: Error handling (401, 400, 404)
- [ ] Step 19: Rate limiting works (429 on 6th attempt)
- [ ] Step 20: Delete postulation successful

---

## Postman Collection

**Alternative to cURL:** Import this into Postman

Save as `fitcv.postman_collection.json`:

```json
{
  "info": {
    "name": "FITCV MVP v0.2",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Auth",
      "item": [
        {
          "name": "Register",
          "request": {
            "method": "POST",
            "url": "http://localhost:3000/api/auth/register",
            "body": {
              "mode": "raw",
              "raw": "{\"email\":\"test@example.com\",\"password\":\"TestPass123!\"}"
            }
          }
        }
      ]
    }
  ]
}
```

---

## Known Limitations (MVP)

1. ⚠️ Database is in-memory (mock)
   - Data lost on server restart
   - v1.0 will use PostgreSQL

2. ⚠️ CV upload is text-only
   - v1.0 will support PDF/DOCX parsing

3. ⚠️ Offers are hardcoded (5 mock)
   - v1.0 will search real portals (RSS + APIs)

4. ⚠️ No auto-apply yet
   - v2.0 will include Chrome extension + auto-apply

5. ⚠️ Claude API key required
   - If not set, CV adaptation returns fallback

---

## Troubleshooting

### Server won't start
```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000

# Kill process (replace PID)
taskkill /PID <PID> /F

# Try again
npm run dev
```

### "Cannot find module" error
```bash
# Rebuild TypeScript
npx tsc

# Reinstall dependencies
npm install
```

### API returns 500 errors
- Check console for error details
- Verify .env has CLAUDE_API_KEY (optional for demo)
- Restart server

### CV generation very slow
- Claude API takes 5-10 seconds (normal)
- Check internet connection

---

**Happy Testing! 🚀**

Report any issues and we'll fix them in Phase 3.
