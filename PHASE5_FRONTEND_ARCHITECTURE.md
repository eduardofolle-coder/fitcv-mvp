# Phase 5: Frontend Integration - Architecture & Components

**Status:** ✅ Design Complete, Ready for Implementation  
**Date:** 2026-09-12  
**Stack:** React 18 + TypeScript + Tailwind CSS + Shadcn/ui

---

## Frontend Architecture

### Project Structure

```
fitcv-frontend/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Layout.tsx
│   │   ├── auth/
│   │   │   ├── LoginForm.tsx
│   │   │   ├── RegisterForm.tsx
│   │   │   └── AuthGuard.tsx
│   │   ├── cv/
│   │   │   ├── CVUploadForm.tsx
│   │   │   ├── CVProfile.tsx
│   │   │   └── CVStats.tsx
│   │   ├── postulations/
│   │   │   ├── PostulationList.tsx
│   │   │   ├── PostulationCard.tsx
│   │   │   ├── CVAdapterModal.tsx
│   │   │   ├── OutcomeReporter.tsx
│   │   │   └── PostulationMatcher.tsx
│   │   ├── offers/
│   │   │   ├── OfferRanking.tsx
│   │   │   ├── OfferCard.tsx
│   │   │   └── OfferFilter.tsx
│   │   └── insights/
│   │       ├── MemorySummary.tsx
│   │       ├── SkillGrowth.tsx
│   │       ├── CompanyInsights.tsx
│   │       └── MarketTrends.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── CVManagement.tsx
│   │   ├── PostulationsTracker.tsx
│   │   ├── OffersRanking.tsx
│   │   ├── Insights.tsx
│   │   └── Settings.tsx
│   ├── services/
│   │   ├── api.ts           # API client
│   │   ├── auth.ts          # Auth service
│   │   ├── cv.ts            # CV endpoints
│   │   ├── postulations.ts  # Postulations endpoints
│   │   ├── learning.ts      # Learning endpoints
│   │   └── offers.ts        # Offers endpoints
│   ├── types/
│   │   └── index.ts         # Shared TypeScript types
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useApi.ts
│   │   └── useMemory.ts
│   ├── context/
│   │   └── AuthContext.tsx
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## Core Pages

### 1. Dashboard (Home Page)

**Purpose:** Quick overview of user's application journey

**Features:**
- Welcome card with user profile
- Quick stats:
  - Total postulations: 12
  - Interviews: 5 (42% rate)
  - Offers: 2
  - Match accuracy: 88%
- Recent postulations (last 5)
- Quick actions (Upload CV, Find Offers, Report Outcome)
- Memory summary (what system learned)

**Component Structure:**
```tsx
<Dashboard>
  <Header />
  <WelcomeCard />
  <StatsGrid stats={stats} />
  <RecentPostulations postulations={recent} />
  <QuickActions />
  <MemorySummary />
</Dashboard>
```

---

### 2. CV Management Page

**Purpose:** Upload, analyze, and manage candidate profile

**Features:**
- Upload CV (drag & drop)
- Display extracted profile:
  - Full name, contact
  - Years of experience
  - Skills (grouped by category)
  - Experience timeline
  - Education
  - Certifications
- Quality metrics (clarity, consistency, grammar, completeness)
- Identified gaps with recommendations
- View profile JSON

**Workflow:**
```
1. User drags CV file
   ↓
2. POST /api/cv/upload with CV text
   ↓
3. cv-analyzer agent processes
   ↓
4. Display profile + quality metrics
   ↓
5. Show gaps and recommendations
```

---

### 3. Postulations Tracker

**Purpose:** Manage and track all job applications

**Features:**
- Table of all postulations:
  - Job title, company, level
  - Status (Por revisar, Preparar, Aplicado, Entrevista, Oferta)
  - Match score (from matcher agent)
  - ATS score (from adapter agent)
  - Created date, outcome date
- Filter by status, company, level
- Quick actions per postulation:
  - Generate adapted CV
  - Report outcome (interview, offer, rejection)
  - View CV vs offer comparison
  - Delete

**Component Structure:**
```tsx
<PostulationsTracker>
  <PostulationFilters />
  <PostulationTable
    columns={[title, company, status, matchScore, atsScore, actions]}
    rows={postulations}
  />
  <OutcomeReportModal />
  <CVAdapterModal />
</PostulationsTracker>
```

---

### 4. Offers Ranking Page

**Purpose:** Discover and rank job opportunities

**Features:**
- List of available offers (mock data for MVP)
- For each offer show:
  - Title, company, level, salary
  - Quick match score (vs. candidate profile)
  - Description preview
- Ranking column:
  - Overall score (0-100)
  - Component scores (skills, growth, salary, location, stability)
  - Why ranked here
- Quick apply button:
  - Creates postulation
  - Generates adapted CV
  - Suggests outcome tracking

**Workflow:**
```
1. GET /api/offers/ranked
   ↓
2. offer-ranker agent scores all offers
   ↓
3. Display ranked list with breakdown
   ↓
4. User clicks "Apply to TechCorp"
   ↓
5. POST /api/postulations (create)
   ↓
6. POST /api/postulations/:id/generate-cv (adapt CV)
   ↓
7. Display adapted CV + ATS score
```

---

### 5. Insights & Memory Page

**Purpose:** Visualize what system learned

**Features:**
- Memory summary:
  - Successful CV patterns (3)
  - Personal heuristics (5)
  - Skills tracked (7)
  - Companies with insights (2)
- Skill growth timeline:
  - Kubernetes: beginner → intermediate → expert
  - Show dates, proficiency, evidence
- Company insights:
  - TechCorp: 75% success rate, 4 interviews, 3 offers
  - Typical interview process
  - Valued skills
  - Culture fit notes
- Market trends:
  - Average salary range (by level, location)
  - In-demand skills with frequency %
  - Top hiring companies
- Personal success heuristics:
  - "Emphasize metrics" (90% success rate)
  - "Lead with team leadership" (85%)

**Component Structure:**
```tsx
<Insights>
  <MemorySummary summary={summary} />
  <SkillGrowthTimeline skills={skills} />
  <CompanyInsights companies={companies} />
  <MarketTrends trends={trends} />
  <SuccessHeuristics heuristics={heuristics} />
</Insights>
```

---

## Key Components

### CVUploadForm
```tsx
interface CVUploadFormProps {
  onSuccess: (profile: CandidateProfile) => void;
  loading?: boolean;
}

<CVUploadForm
  onSuccess={() => navigate('/cv-profile')}
  loading={isUploading}
/>
```

Renders:
- Drag & drop file upload
- Loading progress
- Error handling
- Success → show profile

---

### PostulationMatcher
```tsx
interface PostulationMatcherProps {
  offerId: string;
  onMatch: (result: MatchResult) => void;
}

<PostulationMatcher
  offerId="offer-001"
  onMatch={(result) => {
    console.log(`Match score: ${result.overallMatch}/100`);
  }}
/>
```

Renders:
- Loading (agent calling Claude API)
- Match score breakdown (skills, experience, education)
- Gaps identified
- Recommendations

---

### CVAdapterModal
```tsx
interface CVAdapterModalProps {
  postulationId: string;
  offerId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (adapted: AdaptedCV) => void;
}

<CVAdapterModal
  postulationId="post-123"
  offerId="offer-001"
  isOpen={showAdapter}
  onClose={() => setShowAdapter(false)}
  onSuccess={(adapted) => {
    showToast(`CV adapted! ATS: ${adapted.atsScore}/100`);
  }}
/>
```

Renders:
- Loading (agent generating)
- Original CV preview
- Adapted CV preview
- Side-by-side comparison
- ATS score + keywords
- Changes highlighted

---

### OutcomeReporter
```tsx
interface OutcomeReporterProps {
  postulationId: string;
  onSuccess: () => void;
}

<OutcomeReporter
  postulationId="post-123"
  onSuccess={() => {
    showToast("Great! We learned from this outcome.");
    navigate('/insights');
  }}
/>
```

Renders:
- Radio buttons: Interview, Offer, Rejection, Unknown
- Feedback textarea (optional)
- Days to outcome input
- Submit → triggers learning

---

### OfferRanking
```tsx
interface OfferRankingProps {
  offers: Offer[];
  ranking: OfferRanking[];
  onApply: (offerId: string) => void;
}

<OfferRanking
  offers={offers}
  ranking={rankedOffers}
  onApply={(offerId) => {
    createPostulation(offerId);
  }}
/>
```

Renders:
- Ranked list (TechCorp #1, StartupXYZ #2, etc.)
- Each card shows:
  - Overall score + component breakdown
  - Why ranked here
  - "Apply" button

---

## Services/API Integration

### API Client (`src/services/api.ts`)

```typescript
class FitcvAPI {
  private baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';
  private token?: string;

  setToken(token: string) { this.token = token; }

  async request<T>(method: string, path: string, body?: any): Promise<T> {
    const res = await fetch(`${this.baseURL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) throw new Error(`API error: ${res.statusText}`);
    return res.json();
  }

  // Auth
  async register(email: string, password: string) {
    return this.request('POST', '/auth/register', { email, password });
  }

  async login(email: string, password: string) {
    return this.request('POST', '/auth/login', { email, password });
  }

  // CV
  async uploadCV(cvText: string) {
    return this.request('POST', '/cv/upload', { cvText });
  }

  async getCVProfile() {
    return this.request('GET', '/cv/profile');
  }

  // Postulations
  async createPostulation(offerId: string) {
    return this.request('POST', '/postulations', { offerId });
  }

  async generateAdaptedCV(postulationId: string) {
    return this.request('POST', `/postulations/${postulationId}/generate-cv`, {});
  }

  async matchPostulation(offerId: string) {
    return this.request('POST', '/postulations/match', { offerId });
  }

  async reportOutcome(postulationId: string, outcome: string, feedback?: string) {
    return this.request('POST', '/learning/outcome', {
      postulationId,
      outcome,
      feedback,
    });
  }

  // Offers
  async getRankedOffers() {
    return this.request('GET', '/offers/ranked');
  }

  // Learning
  async getMemorySummary() {
    return this.request('GET', '/learning/summary');
  }
}

export const api = new FitcvAPI();
```

---

## TypeScript Types

```typescript
// Auth
interface User {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

// CV
interface CandidateProfile {
  id: string;
  fullName: string;
  email: string;
  yearsExperience: number;
  skills: { programming: string[]; frameworks: string[]; tools: string[] };
  experience: Experience[];
  education: Education[];
}

interface Experience {
  company: string;
  title: string;
  startDate: string;
  endDate?: string;
  responsibilities: string[];
  achievements: string[];
}

// Postulations
interface Postulation {
  id: string;
  offerId: string;
  estado: string;
  matchScore?: number;
  atsScore?: number;
  createdAt: string;
}

interface MatchResult {
  skillsMatch: number;
  experienceMatch: number;
  educationMatch: number;
  overallMatch: number;
  gaps: Gap[];
}

interface AdaptedCV {
  id: string;
  adaptedCV: string;
  atsScore: number;
  keywords: string[];
  changes: string[];
}

// Offers
interface Offer {
  id: string;
  title: string;
  company: string;
  level: string;
  salary: { min: number; max: number; currency: string };
  description: string;
}

interface OfferRanking {
  rank: number;
  offerId: string;
  overallScore: number;
  scores: {
    skillsFit: number;
    careerGrowth: number;
    compensation: number;
    locationLifestyle: number;
    companyStability: number;
  };
  verdict: string;
}

// Learning
interface MemorySummary {
  successfulPatterns: number;
  personalHeuristics: number;
  skillsTracked: number;
  companiesTracked: number;
}
```

---

## User Flows

### Flow 1: New User Onboarding

```
1. Register → Login
2. Upload CV
3. System analyzes (cv-analyzer)
4. Show profile + quality metrics
5. "Find Offers" → Ranking page
6. Select offer
7. Create postulation
8. Generate adapted CV (cv-adapter)
9. View adaptation
10. "I applied!" or adjust & regenerate
```

---

### Flow 2: Track Application

```
1. View postulations list
2. Click "Report Outcome"
3. Select: Interview/Offer/Rejection
4. Add feedback (optional)
5. Submit
6. System learns pattern
7. Show: "Insights saved!"
8. Go to insights to see what learned
```

---

### Flow 3: Find Best Opportunities

```
1. Dashboard → "Explore Offers"
2. system calls offer-ranker agent
3. Agent ranks all offers
4. Display ranked list
5. Click offer card to see details
6. Click "Apply"
7. Creates postulation
8. Generates adapted CV automatically
9. Show CV + ATS score
10. "Let's apply!"
```

---

## Development Guidelines

### Component Principles

1. **Functional Components Only** - React 18 hooks
2. **TypeScript Everywhere** - No `any` types
3. **Error Boundaries** - Catch component errors
4. **Loading States** - Show progress for all API calls
5. **Empty States** - Handle "no data" gracefully

### Styling

- Tailwind CSS for layout and utilities
- Shadcn/ui for components (Button, Input, Dialog, Card, etc.)
- Dark mode support (respects system preference)
- Responsive (mobile-first)

### Performance

- React.memo for expensive components
- useCallback for event handlers
- Lazy loading for routes
- Suspense for async components

### Testing

- Unit tests for services (Jest)
- Component tests (React Testing Library)
- E2E tests (Playwright)
- Minimum 80% coverage

---

## Phase 5 Milestones

✅ **Milestone 1: Auth & Layout** (Day 1-2)
- Login/register forms
- Protected routes
- Main layout (header, sidebar, content)

✅ **Milestone 2: CV Management** (Day 2-3)
- Upload CV
- Display profile
- Show quality metrics

✅ **Milestone 3: Postulations** (Day 3-4)
- List postulations
- Create postulation
- Generate adapted CV
- Report outcome

✅ **Milestone 4: Offers & Ranking** (Day 4-5)
- Display ranked offers
- Quick apply
- Show ranking breakdown

✅ **Milestone 5: Insights** (Day 5)
- Memory summary
- Skill growth timeline
- Company insights
- Market trends

---

## Next Steps

1. Initialize React + TypeScript project
2. Setup Tailwind + Shadcn/ui
3. Create auth (login/register)
4. Build CV upload flow
5. Build postulations tracker
6. Build offer ranking
7. Build insights page
8. Test end-to-end flows
9. Deploy to staging
10. User testing

---

## Success Criteria

- ✅ User can upload CV in < 30 seconds
- ✅ Match scores displayed within 5 seconds
- ✅ Adapted CV generated in < 10 seconds
- ✅ Ranking shows all offers scored correctly
- ✅ Outcome reporting takes < 1 minute
- ✅ Memory insights are accurate and helpful
- ✅ Mobile responsive on all breakpoints
- ✅ All flows tested end-to-end
- ✅ 80%+ test coverage
- ✅ < 2 second page load time

---

## Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Framework | React 18 |
| Language | TypeScript |
| Styling | Tailwind CSS + Shadcn/ui |
| Routing | React Router v6 |
| State | React Context + hooks |
| API Client | Fetch API |
| Testing | Jest + React Testing Library |
| Build | Vite |
| Deploy | Vercel / AWS S3 |

---

This architecture enables a complete end-to-end user experience for FITCV with intelligent agent-powered features integrated throughout.
