# Phase 3: Frontend React - Scaffold & Roadmap

**Status:** Scaffold Created  
**Stack:** React 18 + TypeScript + Tailwind + Vite  
**Port:** 3001 (with proxy to backend on 3000)

## Structure

```
frontend/
├── src/
│   ├── pages/          (Page components)
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── DashboardPage.tsx
│   │   └── UploadCVPage.tsx
│   ├── components/     (Reusable components)
│   │   ├── Layout.tsx
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── ...
│   ├── hooks/          (Custom hooks)
│   │   ├── useAuth.ts
│   │   ├── useAPI.ts
│   │   └── ...
│   ├── store/          (Zustand state)
│   │   ├── authStore.ts
│   │   └── ...
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Next Steps

### Step 1: Install Frontend Dependencies
```bash
cd frontend
npm install
```

### Step 2: Implement Core Hooks
- `useAuth` - Handle authentication (login, register, logout)
- `useAPI` - Wrapper for axios with interceptors
- `useFetch` - Generic data fetching hook

### Step 3: Build Pages (in order)

**LoginPage**
- Email + Password form
- Call POST /auth/login
- Save token to localStorage + state
- Redirect to dashboard

**RegisterPage**
- Email + Password form (with validation)
- Call POST /auth/register
- Auto-login after register
- Redirect to dashboard

**UploadCVPage**
- Textarea for CV content
- Call POST /cv/upload
- Show profile summary
- Show role suggestions
- Allow role selection

**DashboardPage**
- List postulations with pagination
- Filter by status/priority
- Create new postulation button
- Show stats (total, by level, etc.)
- Redirect to postulation detail

### Step 4: Build Components

**Layout**
- Header (logo, nav, logout button)
- Sidebar (navigation links)
- Main content area

**Header**
- FITCV logo
- User name
- Logout button

**DashboardTable**
- Postulations table
- Title, Company, Level, Status
- Actions: Edit, Delete, View CV

**PostulationCard**
- Job card in list view
- Company, title, salary
- Status badge
- Priority badge

## Technology Decisions

**State Management:** Zustand (lightweight, easy)
**HTTP Client:** Axios (interceptors for auth)
**Routing:** React Router v6
**Styling:** Tailwind CSS
**UI Library:** Shadcn/ui (optional, can add components)

## Environment Setup

Create `frontend/.env`:
```
VITE_API_URL=http://localhost:3000/api
```

## Running Frontend

```bash
cd frontend
npm run dev
# Open http://localhost:3001
```

## Testing Frontend

Once running, test:
1. Register new account
2. Login with credentials
3. Upload CV
4. View profile & roles
5. List job offers
6. Create postulation
7. Generate adapted CV
8. Update postulation status
9. Download CV

## Git Workflow

All frontend code goes to `frontend/src/` branch.

```bash
git add frontend/
git commit -m "Phase 3: Add feature X"
git push
```

## Performance Optimization (Later)

- Code splitting with React.lazy()
- Image optimization
- Bundle analysis
- Caching strategy

## Accessibility (Phase 4)

- ARIA labels
- Keyboard navigation
- Color contrast
- Screen reader support

---

**When all pages + components are done:**
→ Move to Phase 4: Deployment
