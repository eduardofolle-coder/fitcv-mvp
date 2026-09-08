# FITCV MVP v0.2

**CV autoadaptado por oferta laboral usando IA. LATAM focused (Chile pilot).**

## Setup

### Prerequisites
- Node.js v18+
- npm v10+

### Installation

```bash
# Install dependencies
npm install

# Initialize database
npm run db:init

# Create .env file (use .env.example as template)
cp .env.example .env
```

Edit `.env` and add your Claude API key:
```
CLAUDE_API_KEY=sk-ant-xxxxx
```

### Running

```bash
# Development (with hot reload)
npm run dev

# Production build
npm run build
npm start

# Health check
curl http://localhost:3000/health
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get tokens
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout

### Architecture

- **Backend:** Node.js + Express + TypeScript
- **Database:** SQLite (development), PostgreSQL (production)
- **Security:** JWT + bcrypt + AES-256-GCM encryption
- **AI:** Claude API (with DeepSeek fallback)

## Development

```bash
# Run tests
npm test

# Lint
npm run lint
```

## Roadmap

- **v0.2:** MVP with 5 mock offers, CV adaptation, profile analysis
- **v1.0:** Real job search (RSS + APIs), persistent data, dashboard
- **v2.0:** Chrome extension, auto-apply, advanced filtering

---

**Created by Eduardo Folle | 2026**
