# FITCV Deployment Guide

**Version:** MVP v0.2  
**Target:** Railway (Backend) + Vercel (Frontend)  
**Estimated Time:** 30 minutes

---

## Prerequisites

- GitHub account (for code)
- Railway account (free tier available)
- Vercel account (free tier available)
- Claude API key (from console.anthropic.com)

---

## Part A: Backend Deployment (Railway)

### 1. Push Code to GitHub

```bash
cd C:\Users\Userx\Desktop\fitcv-mvp
git remote add origin https://github.com/YOUR_USERNAME/fitcv-mvp.git
git branch -M main
git push -u origin main
```

### 2. Create Railway Project

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub"
4. Connect GitHub and select `fitcv-mvp` repository
5. Select `main` branch

### 3. Configure Backend Service

**Environment Variables (add in Railway dashboard):**

```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://[railway-postgres-url]
JWT_PRIVATE_KEY=your-secret-key-here
JWT_PUBLIC_KEY=your-public-key-here
DATA_ENCRYPTION_KEY=your-32-byte-key-here
CLAUDE_API_KEY=sk-ant-xxxxx
ALLOWED_ORIGINS=https://fitcv.vercel.app
LOG_LEVEL=info
```

### 4. Add PostgreSQL Database

1. In Railway, click "+ New"
2. Select "PostgreSQL"
3. Railway will auto-populate `DATABASE_URL`
4. Copy the URL to your backend service

### 5. Deploy

1. Railway auto-deploys on git push
2. Check "Deployments" tab for status
3. Copy the deployed URL: `https://fitcv-api-xxxxx.railway.app`

---

## Part B: Frontend Deployment (Vercel)

### 1. Create Vercel Project

1. Go to https://vercel.com
2. Click "New Project"
3. Import your GitHub repository
4. Select `main` branch
5. Set framework to "Vite"

### 2. Configure Build Settings

**Build Command:**
```
cd frontend && npm install && npm run build
```

**Output Directory:**
```
frontend/dist
```

### 3. Environment Variables

**In Vercel dashboard, set:**

```
VITE_API_URL=https://fitcv-api-xxxxx.railway.app/api
```

### 4. Deploy

1. Vercel auto-deploys on git push
2. Check "Deployments" tab
3. Your URL: `https://fitcv.vercel.app`

---

## Part C: Local Docker Deployment (Optional)

### For full-stack local testing with PostgreSQL:

```bash
# 1. Build and run with Docker Compose
docker-compose up -d

# 2. Wait for services to start (30s)
docker-compose logs -f

# 3. Test backend
curl http://localhost:3000/health

# 4. Backend at: http://localhost:3000
# 5. Database at: localhost:5432
```

### Connect to PostgreSQL locally:

```bash
psql -h localhost -U fitcv_user -d fitcv
# Password: fitcv_password_dev
```

---

## Monitoring & Logs

### Railway Logs

```bash
# View real-time logs
railway logs

# Or in dashboard: Project → Service → Logs
```

### Vercel Logs

```bash
# View build logs in dashboard
# Project → Deployments → Click deployment → Logs
```

---

## Production Checklist

- [ ] Environment variables set on Railway
- [ ] PostgreSQL database connected
- [ ] Claude API key configured
- [ ] Frontend CORS allowed origins set
- [ ] HTTPS enforced on both services
- [ ] SSL certificates valid
- [ ] Backups configured (Railway: automated)
- [ ] Monitoring enabled (logs)
- [ ] Error tracking (optional: Sentry)

---

## Rollback Plan

### If deployment fails:

1. **Railway:** Go to Deployments → select previous → "Redeploy"
2. **Vercel:** Go to Deployments → select previous → "Redeploy"

### Manual Rollback:

```bash
git revert HEAD
git push origin main
# Auto-redeploys
```

---

## Cost Estimates (as of 2026)

| Service | Tier | Cost/Month |
|---------|------|-----------|
| Railway | Starter | $5-20 |
| Vercel | Pro | $20 |
| Claude API | Pay-as-you-go | $0.01/CV generated |
| **Total** | | **$25-40 + API** |

**Example:** 100K users × 50 CVs/month × $0.01 = $50K/month API (but gross revenue = $2M/month)

---

## Performance Optimization

### Backend (Railway)

- Vertical scale: Add more RAM/CPU if needed
- Horizontal scale: Multiple instances with load balancer
- Cache: Add Redis for session/data cache
- Database: Add read replicas for heavy queries

### Frontend (Vercel)

- Edge caching: Configure in vercel.json
- Image optimization: Use next/image or vite-plugin-imagemin
- Bundle analysis: `npm run build -- --analyze`

---

## Security Checklist

- [ ] Environment variables NEVER in git (use .env.local)
- [ ] JWT keys rotated regularly
- [ ] SSL/TLS enforced
- [ ] CORS properly configured
- [ ] Rate limiting active
- [ ] Input validation on all endpoints
- [ ] Secrets manager for sensitive data

---

## Disaster Recovery

### Backup Strategy

```
Daily automated backups:
- Database: Railway handles (included)
- Code: GitHub (included)
- Secrets: Use Railway's vault

Recovery time: < 1 hour
Recovery point: < 24 hours
```

### Restore from Backup

```bash
# Railway provides one-click restore
# 1. Go to Database service
# 2. Click "Restore"
# 3. Select date
# 4. Done
```

---

## CI/CD Pipeline

### Auto-deploy on git push

```bash
# Add to repository secrets (GitHub)
# → Settings → Secrets

RAILWAY_API_TOKEN=your-token
VERCEL_TOKEN=your-token

# Then add GitHub Actions workflow...
# (see .github/workflows/deploy.yml)
```

---

## Troubleshooting

### Backend won't start

1. Check logs on Railway
2. Verify DATABASE_URL is correct
3. Verify all env vars are set
4. Check Node version (should be 22)

### Frontend won't build

1. Check build logs on Vercel
2. Verify VITE_API_URL is set
3. Verify frontend/package.json exists
4. Check npm dependencies installed

### CORS errors

1. Backend: Verify ALLOWED_ORIGINS includes frontend URL
2. Frontend: Verify VITE_API_URL points to backend
3. Restart services after env changes

### Database connection timeout

1. Verify DATABASE_URL syntax
2. Check PostgreSQL is running (Docker)
3. Check firewall rules (Railway allows public)
4. Verify credentials

---

## Next Steps

1. ✅ Push code to GitHub
2. ✅ Deploy backend to Railway
3. ✅ Deploy frontend to Vercel
4. ✅ Test full flow in production
5. ✅ Monitor logs and metrics
6. ✅ Set up error tracking (Sentry)
7. ✅ Configure analytics (Google Analytics)
8. ✅ Set up monitoring alerts

---

**Deployment Status:**
- Backend: Ready for Railway
- Frontend: Ready for Vercel
- Database: Railway PostgreSQL included
- Monitoring: Built-in (logs)

**Expected uptime:** 99.5%+ with auto-recovery
