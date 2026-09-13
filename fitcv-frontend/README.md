# FITCV Frontend - Next.js + TypeScript

Production-ready React frontend with TypeScript strict mode, integrated with Express backend API.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Backend API running on `http://localhost:3000`

### Installation

```bash
# Install dependencies
npm install

# Create environment file
cp .env.local (already created)
```

### Development

```bash
# Start development server
npm run dev

# Navigate to http://localhost:3000
```

### Build & Production

```bash
# Build for production (already completed successfully)
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## 📁 Project Structure

```
fitcv-frontend/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Home (redirects to login/dashboard)
│   ├── login/page.tsx     # Login page
│   ├── register/page.tsx  # Registration page
│   └── dashboard/page.tsx # Main dashboard with learning views
├── lib/
│   ├── api-client.ts      # HTTP client for API
│   ├── types.ts           # Shared TypeScript types
│   └── hooks/
│       └── useAuth.ts     # Authentication hook
├── public/                # Static assets
└── package.json
```

## 🔐 Authentication

- JWT-based auth with `accessToken` stored in localStorage
- Auto-redirect to login if token is missing/invalid
- Automatic token cleanup on 401 responses

## 🎯 Features Implemented

### Pages
- **Login** - Email/password authentication
- **Register** - New user account creation (12+ char password required)
- **Dashboard** - Learning data visualization with 5 tabs:
  - Top Keywords - Most successful keywords by user
  - Successful Patterns - Companies, roles, average scores
  - Skill Growth - New, strengthened, and obsolete skills
  - Recommendations - Personalized suggestions based on user data
  - Market Trends - Aggregated trends across all users

### API Integration
All endpoints from backend are integrated:
- ✅ `POST /api/auth/login`
- ✅ `POST /api/auth/register`
- ✅ `GET /api/learning/top-keywords`
- ✅ `GET /api/learning/patterns`
- ✅ `GET /api/learning/skill-growth`
- ✅ `GET /api/learning/recommendations`
- ✅ `GET /api/learning/market-trends`

### Type Safety
- Full TypeScript strict mode
- Shared types between frontend and backend
- All API responses are properly typed

### Styling
- Tailwind CSS for rapid UI development
- Responsive design (mobile-first)
- Dark mode ready

## 🛠 Configuration

### Environment Variables
- `NEXT_PUBLIC_API_URL=http://localhost:3000/api` (already configured)

### TypeScript Configuration
- Strict mode enabled
- No implicit `any`
- Unused variables error
- ESLint integrated

## 📋 Build Status

✅ **Build Successful** - No TypeScript errors, ready to run

## 🚀 Next Steps

1. Start backend: `cd ../` then `npm run dev`
2. Start frontend: `npm run dev` (in fitcv-frontend directory)
3. Navigate to http://localhost:3000
4. Register or login to test
