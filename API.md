# FITCV API Endpoints

**Base URL:** `http://localhost:3000/api`

**Authentication:** Bearer token in `Authorization` header or `refreshToken` in cookies

---

## Authentication Endpoints

### POST /auth/register
Register new user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGc...",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

---

### POST /auth/login
Login and receive tokens.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGc...",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

**Headers Set:**
- `Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict`

---

### POST /auth/refresh
Refresh access token.

**Request:** (body empty, cookie `refreshToken` auto-sent)

**Response:**
```json
{
  "accessToken": "eyJhbGc...",
  "expiresIn": 900
}
```

---

### POST /auth/logout
Logout and invalidate all tokens.

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

---

## CV Endpoints

### POST /cv/upload
Upload and analyze CV.

**Request:**
```json
{
  "cvContent": "John Doe...[full CV text]...Python, SQL...",
  "fullName": "John Doe (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "profileId": "uuid",
    "profile": {
      "fullName": "John Doe",
      "yearsExperience": 8,
      "education": ["Computer Science BS"],
      "skills": ["Python", "SQL", "Data Analysis", ...],
      "summary": "Data analyst with 8 years experience..."
    }
  }
}
```

---

### GET /cv/profile
Get user's CV profile.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "fullName": "John Doe",
    "yearsExperience": 8,
    "education": ["Computer Science BS"],
    "skills": ["Python", "SQL", ...],
    "summary": "...",
    "createdAt": "2026-09-08T..."
  }
}
```

---

### POST /cv/suggest-roles
Generate role suggestions based on CV.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "title": "Senior Data Analyst",
      "level": "L4",
      "matchScore": 92,
      "description": "Why this role fits..."
    },
    ...
  ]
}
```

---

### GET /cv/roles
List all suggested roles for user.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "roleTitle": "Senior Data Analyst",
      "level": "L4",
      "matchScore": 92,
      "isSelected": false
    },
    ...
  ]
}
```

---

### POST /cv/select-roles
Mark roles as selected.

**Request:**
```json
{
  "roleIds": ["uuid1", "uuid2", ...]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Roles selected successfully"
}
```

---

## Postulation Endpoints

### POST /postulations
Create a postulation for a job offer.

**Request:**
```json
{
  "offerId": "uuid",
  "estado": "Por revisar",
  "prioridad": "Alta",
  "notes": "Met the recruiter at event"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "postulationId": "uuid",
    "offerId": "uuid",
    "estado": "Por revisar",
    "prioridad": "Alta",
    "postulationWeight": 2
  }
}
```

**Estados allowed:**
- `Por revisar` (default)
- `Preparar postulación`
- `Descartado`
- `Aplicado`
- `En revisión`
- `Entrevista`

**Prioridades allowed:**
- `Alta`
- `Media`
- `Baja`

---

### GET /postulations
List user's postulations with filters and pagination.

**Query Parameters:**
- `page`: 1 (default)
- `limit`: 20 (default)
- `estado`: Filter by state
- `prioridad`: Filter by priority

**Example:** `/postulations?estado=Aplicado&prioridad=Alta&page=1&limit=20`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "offerId": "uuid",
      "title": "Senior Data Analyst",
      "company": "Amazon",
      "level": "L4",
      "salaryMin": 5000000,
      "salaryMax": 7000000,
      "location": "Santiago, Chile",
      "estado": "Aplicado",
      "prioridad": "Alta",
      "postulationWeight": 2,
      "notes": "...",
      "createdAt": "2026-09-08T..."
    },
    ...
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

### GET /postulations/:id
Get specific postulation details.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "offerId": "uuid",
    "title": "Senior Data Analyst",
    "company": "Amazon",
    "level": "L4",
    "description": "Full job description...",
    "requirements": ["SQL", "Python", "AWS", ...],
    "estado": "Aplicado",
    "prioridad": "Alta",
    "notes": "..."
  }
}
```

---

### PUT /postulations/:id
Update postulation state, priority, or notes.

**Request:**
```json
{
  "estado": "Entrevista",
  "prioridad": "Alta",
  "notes": "Follow-up scheduled for next week"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Postulation updated successfully"
}
```

---

### DELETE /postulations/:id
Delete a postulation.

**Response:**
```json
{
  "success": true,
  "message": "Postulation deleted successfully"
}
```

---

### POST /postulations/:id/generate-cv
Generate adapted CV for this postulation using Claude AI.

**Response:**
```json
{
  "success": true,
  "data": {
    "cvId": "uuid",
    "atsScore": 87,
    "changes": [
      "Reorganized experience to emphasize SQL skills",
      "Added keywords: AWS, Data Pipeline, ETL",
      "Highlighted 8 years of relevant experience"
    ],
    "keywords": ["SQL", "Python", "AWS", "Data Analysis", ...]
  }
}
```

**Note:** This calls Claude API and may take 5-10 seconds.

---

### GET /postulations/:id/cv
Download the adapted CV for this postulation.

**Response:**
```json
{
  "success": true,
  "data": {
    "content": "John Doe\n...[full adapted CV in plain text]...",
    "atsScore": 87,
    "changes": [...],
    "job": "Senior Data Analyst at Amazon"
  }
}
```

---

## Offers Endpoints

### GET /offers
List all job offers with filters and pagination.

**Query Parameters:**
- `page`: 1 (default)
- `limit`: 20 (default)
- `level`: L1-L6
- `company`: Company name (partial match)
- `location`: Location (partial match)
- `minSalary`: Minimum salary
- `maxSalary`: Maximum salary
- `search`: Search in title and description

**Example:** `/offers?level=L4&company=Amazon&minSalary=5000000&page=1`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Senior Data Analyst",
      "company": "Amazon",
      "level": "L4",
      "salary": {
        "min": 5000000,
        "max": 7000000,
        "currency": "CLP"
      },
      "location": "Santiago, Chile",
      "description": "We're looking for...",
      "requirements": ["SQL", "Python", "AWS"],
      "source": "linkedin",
      "url": "https://linkedin.com/...",
      "createdAt": "2026-09-08T..."
    },
    ...
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 124,
    "totalPages": 7
  }
}
```

---

### GET /offers/:id
Get specific job offer details.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Senior Data Analyst",
    "company": "Amazon",
    "level": "L4",
    "salary": {
      "min": 5000000,
      "max": 7000000,
      "currency": "CLP"
    },
    "location": "Santiago, Chile",
    "description": "Full description...",
    "requirements": ["SQL", "Python", "AWS", ...],
    "source": "linkedin",
    "url": "https://linkedin.com/...",
    "createdAt": "2026-09-08T..."
  }
}
```

---

### GET /offers/stats/summary
Get dashboard statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalOffers": 124,
    "byLevel": [
      {"level": "L1", "count": 10},
      {"level": "L2", "count": 15},
      ...
    ],
    "topCompanies": [
      {"company": "Amazon", "count": 12},
      {"company": "Google", "count": 10},
      ...
    ],
    "userPostulations": 15,
    "stats": {
      "totalOffers": 124,
      "averageSalary": 4500000,
      "topLocations": ["Santiago", "Valparaíso"]
    }
  }
}
```

---

## Error Responses

All error responses follow this format:

**Production (generic):**
```json
{
  "error": "Internal server error",
  "errorId": "abc123-def456"
}
```

**Development (detailed):**
```json
{
  "error": "Specific error message",
  "errorId": "abc123-def456",
  "stack": "Error: ...\n at ..."
}
```

**Common Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `429` - Too many requests (rate limited)
- `500` - Internal server error

---

## Testing with cURL

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'

# Login (save the accessToken)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'

# Upload CV (replace TOKEN with accessToken)
curl -X POST http://localhost:3000/api/cv/upload \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cvContent": "John Doe. 8 years experience. Skills: Python, SQL, AWS..."
  }'

# Get offers
curl -X GET "http://localhost:3000/api/offers?level=L4" \
  -H "Authorization: Bearer TOKEN"

# Create postulation
curl -X POST http://localhost:3000/api/postulations \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "offerId": "OFFER_ID",
    "estado": "Por revisar",
    "prioridad": "Alta"
  }'
```

---

## Rate Limits

- **Login/Register:** 5 attempts per 15 minutes per IP
- **CV Upload:** 5 uploads per hour per user
- **CV Generate:** 1 generation per 30 seconds per user
- **General API:** 100 requests per minute per user

---

## Authentication Flow

1. **Register/Login** → Get `accessToken` + `refreshToken` (cookie)
2. **Use `accessToken`** in Authorization header for all requests
3. **When token expires** → POST /auth/refresh to get new `accessToken`
4. **On logout** → POST /auth/logout to invalidate all tokens

---

**Last Updated:** 2026-09-08  
**Version:** MVP v0.2
