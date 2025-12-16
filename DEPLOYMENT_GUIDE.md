# 🚀 QuantumShield Deployment Guide

## Overview
This guide covers deploying QuantumShield to production using free-tier services:
- **Frontend**: Vercel (Free tier)
- **Backend**: Render (Free tier)
- **Database**: Neon PostgreSQL (Free tier)

---

## 📋 Prerequisites

1. **GitHub Account** - Code repository
2. **Vercel Account** - Frontend hosting (sign up at https://vercel.com)
3. **Render Account** - Backend hosting (sign up at https://render.com)
4. **Neon Account** - PostgreSQL database (sign up at https://neon.tech)

---

## Part 1: Push to GitHub

### Step 1: Initialize Git Repository (if not already done)

```bash
cd QuantumSheild
git init
git add .
git commit -m "Initial commit - QuantumShield PQC Chat App"
```

### Step 2: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `quantumshield`
3. Description: "Post-Quantum Secure Chat & File Transfer Application"
4. Visibility: Public or Private
5. **DO NOT** initialize with README (we already have one)
6. Click "Create repository"

### Step 3: Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/quantumshield.git
git branch -M main
git push -u origin main
```

---

## Part 2: Deploy Database (Neon PostgreSQL)

### Step 1: Create Neon Project

1. Go to https://console.neon.tech
2. Click "New Project"
3. Project name: `quantumshield-prod`
4. Region: Choose closest to your users
5. PostgreSQL version: 16 (latest stable)
6. Click "Create Project"

### Step 2: Get Connection String

1. In your Neon project dashboard, click "Connection Details"
2. Copy the connection string (format: `postgresql://user:password@host/dbname`)
3. Save it securely - you'll need it for backend deployment

**Example:**
```
postgresql://quantumshield_user:AbCdEf123@ep-cool-forest-123456.us-east-2.aws.neon.tech/quantumshield?sslmode=require
```

### Step 3: Database Schema Setup

The database schema will be automatically created when the backend starts.
No manual SQL execution needed - tables are created via `initDb()` on first run.

---

## Part 3: Deploy Backend (Render)

### Step 1: Create New Web Service

1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Select the `quantumshield` repository

### Step 2: Configure Build Settings

- **Name**: `quantumshield-backend`
- **Region**: Oregon (US West) - Free tier available
- **Branch**: `main`
- **Root Directory**: `backend`
- **Runtime**: Node
- **Build Command**: 
  ```bash
  npm install
  ```
- **Start Command**:
  ```bash
  npm start
  ```
- **Instance Type**: Free

### Step 3: Add Environment Variables

Click "Advanced" → "Add Environment Variable":

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Required |
| `PORT` | `3001` | Render auto-assigns, but set default |
| `DATABASE_URL` | `<your-neon-connection-string>` | From Neon dashboard |
| `JWT_SECRET` | `<generate-random-64-chars>` | Use: `openssl rand -base64 64` |
| `ALLOWED_ORIGINS` | `https://your-frontend.vercel.app` | Update after frontend deploy |

**Generate JWT Secret:**
```bash
# On Windows PowerShell:
$bytes = New-Object byte[] 64; (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes); [Convert]::ToBase64String($bytes)

# On Linux/Mac:
openssl rand -base64 64
```

### Step 4: Deploy

1. Click "Create Web Service"
2. Wait for build to complete (3-5 minutes)
3. Your backend will be live at: `https://quantumshield-backend.onrender.com`
4. **Copy this URL** - you'll need it for frontend

### Step 5: Verify Backend

Visit: `https://quantumshield-backend.onrender.com`

You should see:
```
QuantumShield Backend is running...
```

**Test health endpoints:**
- `GET /` → "QuantumShield Backend is running..."
- `POST /api/auth/register` → Should accept registration
- `POST /api/auth/login` → Should accept login

---

## Part 4: Deploy Frontend (Vercel)

### Step 1: Import Project

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Select your `quantumshield` repository
4. Click "Import"

### Step 2: Configure Project

- **Framework Preset**: Create React App (auto-detected)
- **Root Directory**: `frontend` (IMPORTANT!)
- **Build Command**: `npm run build` (auto-detected)
- **Output Directory**: `build` (auto-detected)
- **Install Command**: `npm install`

### Step 3: Add Environment Variables

Click "Environment Variables":

| Key | Value | Notes |
|-----|-------|-------|
| `REACT_APP_API_URL` | `https://quantumshield-backend.onrender.com` | Your Render backend URL |
| `NODE_ENV` | `production` | Required |

### Step 4: Deploy

1. Click "Deploy"
2. Wait for build to complete (2-4 minutes)
3. Your frontend will be live at: `https://quantumshield-<random>.vercel.app`

### Step 5: Update Backend CORS

1. Go back to Render dashboard
2. Navigate to your backend service
3. Go to "Environment" tab
4. Update `ALLOWED_ORIGINS` to your Vercel URL:
   ```
   https://quantumshield-<random>.vercel.app
   ```
5. Save and redeploy backend

---

## Part 5: Post-Deployment Configuration

### Update CORS Origins

In `backend/src/server.js`, the CORS configuration reads from `ALLOWED_ORIGINS` env var:

```javascript
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];
```

Update Render environment variable to include both production and development:
```
https://quantumshield.vercel.app,http://localhost:3000
```

### Configure Custom Domain (Optional)

**Vercel:**
1. Go to Project Settings → Domains
2. Add your custom domain
3. Follow DNS configuration steps

**Render:**
1. Go to Settings → Custom Domain
2. Add your API subdomain (e.g., `api.yourdomain.com`)
3. Update DNS records

### Set Up Monitoring

**Vercel Analytics:**
1. Enable in Project Settings → Analytics
2. Free tier: 100k events/month

**Render Logs:**
1. View in Render Dashboard → Logs tab
2. Auto-expires after 7 days (free tier)

---

## 🔒 Security Checklist

Before going live:

- [ ] `JWT_SECRET` is strong (64+ random characters)
- [ ] `DATABASE_URL` contains SSL mode: `?sslmode=require`
- [ ] `ALLOWED_ORIGINS` only includes your production domain
- [ ] All `.env` files are in `.gitignore`
- [ ] HTTPS enforced on both frontend and backend
- [ ] Database user has minimal required permissions
- [ ] Rate limiting enabled (already configured)
- [ ] Helmet security headers active (already configured)

---

## 📊 Free Tier Limits

### Vercel (Frontend)
- ✅ 100 GB bandwidth/month
- ✅ Unlimited deployments
- ✅ Automatic HTTPS
- ✅ Global CDN
- ⚠️ 100 builds/day limit

### Render (Backend)
- ✅ 750 hours/month (enough for 24/7)
- ✅ 512 MB RAM
- ✅ Automatic HTTPS
- ⚠️ Spins down after 15 min inactivity (cold starts ~30s)
- ⚠️ Limited CPU (shared)

### Neon PostgreSQL (Database)
- ✅ 3 GB storage
- ✅ 1 project, unlimited databases
- ✅ Automatic backups (7 days retention)
- ⚠️ 100 hours compute/month (enough for small apps)
- ⚠️ Auto-suspend after 5 min inactivity

---

## 🐛 Troubleshooting

### Backend won't start

**Check Render logs:**
```
Failed to connect to database
```
**Solution:** Verify `DATABASE_URL` includes `?sslmode=require`

---

### CORS errors in browser

**Error:**
```
Access to fetch at 'https://backend.onrender.com' from origin 'https://frontend.vercel.app' has been blocked by CORS policy
```

**Solution:** 
1. Update `ALLOWED_ORIGINS` in Render
2. Redeploy backend
3. Wait 2-3 minutes for redeploy

---

### Database connection pool exhausted

**Error:**
```
Error: Connection pool exhausted
```

**Solution:**
- Free tier has limited connections
- Reduce `max: 10` to `max: 5` in `backend/src/database/db.js`
- Enable `allowExitOnIdle: true` (already configured)

---

### Render cold starts

**Issue:** Backend takes 30s to respond after inactivity

**Solutions:**
1. **Accept it** (free tier limitation)
2. **Ping service** every 10 minutes:
   ```javascript
   // Add to frontend
   setInterval(() => {
     fetch('https://backend.onrender.com/').catch(() => {});
   }, 10 * 60 * 1000);
   ```
3. **Upgrade to paid plan** ($7/month - stays always on)

---

### Frontend build fails

**Error:**
```
Module not found: Can't resolve '@openforge-sh/liboqs'
```

**Solution:**
1. Verify `frontend/package.json` includes the dependency
2. Clear Vercel build cache: Deployments → Settings → Clear Cache
3. Redeploy

---

## 🔄 Continuous Deployment

Both Vercel and Render auto-deploy on git push:

```bash
git add .
git commit -m "feat: add new feature"
git push origin main
```

**Deploy triggers:**
- Vercel: Redeploys frontend automatically
- Render: Redeploys backend automatically

**Preview deployments (Vercel only):**
- Every PR gets a preview URL
- Test before merging to main

---

## 📈 Monitoring & Logs

### View Backend Logs (Render)
```
https://dashboard.render.com → Your Service → Logs
```

### View Frontend Logs (Vercel)
```
https://vercel.com/dashboard → Your Project → Deployments → Latest → Logs
```

### Database Monitoring (Neon)
```
https://console.neon.tech → Your Project → Monitoring
```

Shows:
- Active connections
- Query performance
- Storage usage

---

## 💰 Cost Optimization Tips

1. **Combine services** - Use Render for both backend + database (PostgreSQL addon)
2. **Optimize images** - Compress static assets before deployment
3. **Enable caching** - Frontend static files cached by Vercel CDN
4. **Lazy load** - Code split React app to reduce initial load
5. **Monitor usage** - Set up billing alerts before hitting limits

---

## 🎯 Production Readiness Checklist

Before announcing to users:

- [ ] All environment variables set correctly
- [ ] HTTPS enforced everywhere
- [ ] Database backups configured
- [ ] Error tracking setup (Sentry - optional)
- [ ] Uptime monitoring (UptimeRobot - optional)
- [ ] User testing completed
- [ ] Load testing performed
- [ ] Security audit passed
- [ ] Documentation updated
- [ ] Support email configured

---

## 📞 Support Resources

- **Vercel Docs**: https://vercel.com/docs
- **Render Docs**: https://render.com/docs
- **Neon Docs**: https://neon.tech/docs
- **GitHub Issues**: Create issues in your repository

---

## 🎉 Success!

Your QuantumShield app is now live at:
- **Frontend**: `https://quantumshield.vercel.app`
- **Backend**: `https://quantumshield-backend.onrender.com`
- **Database**: Neon PostgreSQL

**Share your secure chat app with the world!** 🔐

---

## Next Steps

1. **Add custom domain** for professional look
2. **Set up analytics** to track usage
3. **Enable error tracking** for better debugging
4. **Create user documentation**
5. **Plan monetization** (if applicable)
6. **Build mobile app** (Flutter code ready in `/mobile`)

---

**Need help?** Open an issue on GitHub or contact support@quantumshield.io
