# FITCV Deployment Guide

Production-ready deployment instructions for FITCV MVP (Phases 1-5 complete).

## 📋 Prerequisites

- Docker & Docker Compose (recommended)
- OR Node.js 20+ + npm
- Claude API key from https://console.anthropic.com
- Domain name (optional, for HTTPS)

## 🚀 Option 1: Docker Compose (Recommended)

Fastest way to deploy both backend and frontend together.

### Setup

```bash
# Clone repository
git clone <repo>
cd fitcv-mvp

# Copy environment template
cp .env.example .env

# Edit .env with your secrets
nano .env
# Set: JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY, CLAUDE_API_KEY
```

### Deploy

```bash
# Build and start all services
docker-compose up --build

# Services will be available at:
# - Backend API: http://localhost:3000
# - Frontend UI: http://localhost:3001
```

### Verify

```bash
curl http://localhost:3000/health
curl http://localhost:3001
```

## 🚀 Option 2: Vercel + Railway (Recommended for Production)

### Backend (Railway)

```bash
# 1. Push code to GitHub
git push origin main

# 2. Connect to Railway: https://railway.app
# 3. New Project → GitHub repo
# 4. Set environment variables:
#    - NODE_ENV=production
#    - JWT_SECRET=<generate>
#    - JWT_REFRESH_SECRET=<generate>
#    - ENCRYPTION_KEY=<32 random chars>
#    - CLAUDE_API_KEY=<your key>

# 5. Deploy - Railway auto-deploys from git
```

Railway will provide: `https://fitcv-backend-prod.railway.app`

### Frontend (Vercel)

```bash
# 1. Push code to GitHub

# 2. Import project: https://vercel.com/new
#    - Select: fitcv-frontend folder
#    - Framework: Next.js
#    - Build: npm run build
#    - Start: npm start

# 3. Set environment variable:
#    - NEXT_PUBLIC_API_URL=https://fitcv-backend-prod.railway.app/api

# 4. Deploy - Vercel auto-deploys from git
```

Vercel will provide: `https://fitcv-frontend.vercel.app`

## 🚀 Option 3: AWS Elastic Beanstalk

### Backend

```bash
# 1. Create Elastic Beanstalk app
eb create fitcv-backend --instance-type t3.micro

# 2. Set environment variables
eb setenv \
  NODE_ENV=production \
  JWT_SECRET=<generate> \
  JWT_REFRESH_SECRET=<generate> \
  ENCRYPTION_KEY=<32 chars> \
  CLAUDE_API_KEY=<your key>

# 3. Deploy
eb deploy

# 4. Enable HTTPS (AWS Certificate Manager)
eb scale 2  # Auto-scaling
```

### Frontend (S3 + CloudFront)

```bash
# 1. Build
npm run build

# 2. Upload to S3
aws s3 sync .next s3://fitcv-frontend/ --delete

# 3. CloudFront invalidation
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

## 🔒 Security Checklist

Before going to production:

- [ ] Generate strong secrets (32+ chars, random)
- [ ] Enable HTTPS with SSL certificate
- [ ] Set rate limiting limits
- [ ] Configure CORS for your domain only
- [ ] Enable database encryption
- [ ] Set up monitoring/alerting
- [ ] Enable audit logging
- [ ] Configure backup strategy
- [ ] Test authentication flows
- [ ] Run security scan (npm audit)

## 📊 Monitoring

### Health Checks

```bash
# Backend
curl https://api.fitcv.example.com/health

# Frontend
curl https://fitcv.example.com
```

### Logs

```bash
# Docker
docker-compose logs -f backend
docker-compose logs -f frontend

# Railway/Vercel - view in dashboard

# AWS - CloudWatch logs
```

## 🔄 CI/CD Pipeline (GitHub Actions)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Railway
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: railway up

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Vercel
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
        run: vercel --prod
```

## 🚨 Troubleshooting

### "Port already in use"
```bash
# Change port in .env
PORT=3001
```

### "Database locked"
```bash
# Stop all processes and restart
docker-compose restart
```

### "CLAUDE_API_KEY invalid"
```bash
# Verify key format: sk-ant-...
# Check at https://console.anthropic.com
```

### "CORS errors in browser"
```bash
# Update ALLOWED_ORIGINS in .env
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
```

## 📈 Scaling

For high traffic:

1. **Database**: Switch from SQLite to PostgreSQL
2. **Cache**: Add Redis for session storage
3. **API**: Use load balancer (AWS ALB, Nginx)
4. **CDN**: Cloudflare for static assets
5. **Analytics**: Add monitoring (Datadog, New Relic)

## 📞 Support

For issues:
1. Check logs first
2. Verify environment variables
3. Test with curl before debugging UI
4. Check security audit with `npm audit`

---

**Status**: All 5 phases complete and production-ready ✅
