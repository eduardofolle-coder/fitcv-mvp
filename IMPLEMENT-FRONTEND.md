# 🎨 FRONTEND Implementation - Step by Step

## Fase 3: Implementar React Dashboard

**Tiempo estimado:** 1-2 semanas  
**Stack:** React 18 + TypeScript + Tailwind + Vite

---

## Paso 1: Setup Inicial

```bash
cd frontend
npm install
```

**Qué se instala:**
- React 18
- React Router v6
- Axios (HTTP client)
- Zustand (state)
- Tailwind CSS
- TypeScript

---

## Paso 2: Crear Estructura Base

**Crear carpetas:**
```bash
frontend/src/
├── hooks/
│   ├── useAuth.ts          # Auth logic
│   ├── useAPI.ts           # API wrapper
│   └── useFetch.ts         # Data fetching
├── store/
│   ├── authStore.ts        # Auth state (Zustand)
│   └── postulationsStore.ts
├── components/
│   ├── Layout.tsx          # Main layout
│   ├── Header.tsx          # Nav bar
│   ├── Sidebar.tsx         # Side menu
│   ├── PostulationTable.tsx
│   ├── PostulationCard.tsx
│   ├── CVPreview.tsx
│   └── ...
├── pages/
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── DashboardPage.tsx
│   ├── UploadCVPage.tsx
│   ├── PostulationDetailPage.tsx
│   └── ...
├── utils/
│   ├── constants.ts
│   ├── formatters.ts
│   └── validators.ts
├── styles/
│   └── index.css           # Tailwind
├── types/
│   └── index.ts            # TypeScript types
├── App.tsx
└── main.tsx
```

---

## Paso 3: Implementar Hooks (Día 1)

### useAuth.ts
```typescript
// Handles login, register, logout
// Stores token in localStorage + Zustand store
// Provides isAuthenticated, user, token

// Features:
- Register user
- Login user
- Logout (clear state)
- Auto-login on page load
- Token refresh on expiry
```

### useAPI.ts
```typescript
// Axios wrapper with interceptors
// Auto-add Authorization header
// Handle 401 → redirect to login
// Handle errors gracefully

// Usage:
const api = useAPI();
const data = await api.get('/offers');
```

### useFetch.ts
```typescript
// Generic data fetching hook
// Handles loading, error, data states
// Memoization to prevent refetch

// Usage:
const { data, loading, error } = useFetch('/cv/profile');
```

---

## Paso 4: Implementar Pages (Día 2-3)

### LoginPage
```
Form with:
- Email input
- Password input
- "Remember me" checkbox
- Login button
- Link to register

Flow:
1. User enters email + password
2. Click login
3. Call POST /auth/login
4. Save token to localStorage + store
5. Redirect to /dashboard
```

### RegisterPage
```
Form with:
- Email input
- Password input
- Password confirmation
- T&C checkbox
- Register button
- Link to login

Flow:
1. User enters email + password
2. Validate password strength
3. Click register
4. Call POST /auth/register
5. Auto-login
6. Redirect to /upload-cv
```

### UploadCVPage
```
Form with:
- Textarea for CV content
- Upload button
- Loading state

Flow:
1. User pastes CV text
2. Click upload
3. Show loading spinner
4. Claude API analyzes (10s wait)
5. Show profile summary
6. Show role suggestions
7. Allow user to select roles
8. Save selection
9. Redirect to /dashboard
```

### DashboardPage
```
Layout with:
- Header (nav bar)
- Sidebar (filters)
- Main content (postulations table)

Features:
- List postulations with pagination
- Filter by status, priority
- Search by company/title
- Click row to see details
- Create new postulation button
- Delete postulation with confirm
- Show stats (total, by level, etc.)

Columns:
- Job title
- Company
- Level
- Salary range
- Status badge
- Priority badge
- Actions (edit, delete, view CV)
```

### PostulationDetailPage
```
Layout with:
- Job details (title, company, description)
- Status/priority selectors
- Notes textarea
- "Generate Adapted CV" button
- CV preview (if generated)
- ATS score
- Download button
- Delete button
```

---

## Paso 5: Implementar Componentes (Día 3-4)

### Layout.tsx
```
Contains:
- Header (top)
- Sidebar (left)
- Main content (center)
- Footer (bottom)

Responsive:
- Desktop: sidebar + content
- Mobile: hamburger menu + content
```

### Header.tsx
```
Contains:
- FITCV logo + link to /dashboard
- Navigation links (Dashboard, Upload CV)
- User menu (name, logout)
- Search bar (optional)
```

### PostulationTable.tsx
```
Table with:
- Sortable columns
- Pagination
- Filter buttons
- Row actions (edit, delete)
- Click row to detail page

Virtualization:
- Use react-window for 1000+ rows
```

### CVPreview.tsx
```
Shows:
- Adapted CV text
- ATS score (large badge)
- List of changes made
- Keywords used
- Download as text
- Copy to clipboard
```

---

## Paso 6: Setup Zustand Store (Día 2)

### authStore.ts
```typescript
// Global auth state
- token (JWT)
- user (email, id)
- isAuthenticated
- setToken()
- setUser()
- logout()
- loadFromStorage()

// Persists to localStorage
```

### postulationsStore.ts
```typescript
// Global postulations state
- postulations (list)
- selectedPostulation
- filters (status, priority)
- setPostulations()
- addPostulation()
- updatePostulation()
- deletePostulation()
- setFilters()
```

---

## Paso 7: Styling with Tailwind (Día 4)

**Color Scheme:**
```
Primary:   Blue (#3B82F6)
Secondary: Green (#10B981)
Danger:    Red (#EF4444)
Gray:      Slate (#64748B)

Light mode:   White background
Dark mode:    Gray-900 background
```

**Components to style:**
- Buttons (primary, secondary, danger)
- Cards (postulation, offer, stats)
- Badges (status, priority, level)
- Tables
- Forms (inputs, textareas, selects)
- Modals
- Alerts

---

## Paso 8: Testing Frontend (Día 5)

### Manual Testing
```
1. Register new account
2. Login
3. Upload CV (use sample text)
4. View profile + roles
5. Select a role
6. Go to dashboard
7. Create postulation
8. Generate adapted CV (wait 10s)
9. View CV with ATS score
10. Update postulation status
11. Download CV
12. Delete postulation
13. Logout
14. Login again with same account
```

### E2E Testing (later)
```
Use Playwright:
- Test login/register flow
- Test CV upload
- Test postulation CRUD
- Test error scenarios
```

---

## Paso 9: Optimization (Día 6)

**Performance:**
- Code splitting with React.lazy()
- Image optimization
- Memoization with useMemo/useCallback
- Virtual scrolling for large lists

**Accessibility:**
- ARIA labels
- Keyboard navigation
- Color contrast validation
- Screen reader testing

**SEO (optional):**
- Meta tags
- Open Graph tags
- Sitemap

---

## Development Checklist

- [ ] Setup complete (npm install)
- [ ] Folder structure created
- [ ] useAuth hook implemented
- [ ] useAPI hook implemented
- [ ] useFetch hook implemented
- [ ] authStore (Zustand) implemented
- [ ] LoginPage implemented + tested
- [ ] RegisterPage implemented + tested
- [ ] UploadCVPage implemented + tested
- [ ] DashboardPage implemented + tested
- [ ] PostulationDetailPage implemented + tested
- [ ] Layout component implemented
- [ ] Header component implemented
- [ ] PostulationTable component implemented
- [ ] CVPreview component implemented
- [ ] Tailwind styling complete
- [ ] Mobile responsive ✅
- [ ] Dark mode (optional)
- [ ] E2E tests written
- [ ] Performance optimized
- [ ] Ready for deployment ✅

---

## Running Frontend

```bash
cd frontend
npm run dev
# Open http://localhost:3001
```

**Make sure backend is running:**
```bash
cd ..
npm run dev
# Backend at http://localhost:3000
```

---

## Architecture Diagram

```
App.tsx (Routes)
├── LoginPage (public route)
├── RegisterPage (public route)
└── Layout (protected routes)
    ├── Header
    ├── Sidebar
    └── Pages
        ├── DashboardPage
        ├── UploadCVPage
        └── PostulationDetailPage
            └── CVPreview

Stores:
├── authStore (JWT, user)
└── postulationsStore (list, filters)

Hooks:
├── useAuth (login, logout, register)
├── useAPI (axios wrapper)
└── useFetch (data fetching)
```

---

## Common Issues & Fixes

### "API not found" error
```
Verificar:
- Backend running on :3000
- VITE_API_URL en .env
- Proxy en vite.config.ts
```

### Token not persisting
```
Verificar:
- localStorage en useAuth
- Zustand store initialization
- Token in Authorization header
```

### Styling not loading
```
Verificar:
- Tailwind CSS en package.json
- npm install
- index.css imported in main.tsx
```

---

**Tiempo total:** 5-7 días con 1 dev, 2-3 días con 2 devs

¡Iniciá cuando esté listo!
