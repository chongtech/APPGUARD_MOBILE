# Deployment Guide

## Option 1: Vercel (Recommended)

**Initial Setup**:
```bash
# Install Vercel CLI (optional)
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel
```

**Automatic CI/CD with Vercel**:

Vercel provides **automatic CI/CD out of the box** when you connect your Git repository:

1. **Connect Repository**:
   - Go to [vercel.com](https://vercel.com)
   - Click "Import Project"
   - Select your GitHub/GitLab/Bitbucket repository
   - Vercel automatically detects Vite configuration

2. **Configure Environment Variables**:
   - In Vercel Dashboard → Project → Settings → Environment Variables
   - Add:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
   - Set for: Production, Preview, Development

3. **Automatic Deployments**:
   - **Production**: Every push to `main` branch → automatic production deployment
   - **Preview**: Every push to feature branches → automatic preview deployment with unique URL
   - **Pull Requests**: Automatic preview deployment + comment on PR with URL

4. **Build Configuration** (auto-detected):
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
   - Framework: Vite

5. **Domain Setup**:
   - Production URL: `your-project.vercel.app`
   - Custom domain: Configure in Settings → Domains
   - HTTPS is automatic

**How Vercel CI/CD Works**:
```
Git Push → Vercel Webhook → Build Triggered → Run Tests (if any) → Build → Deploy → Live
```

**Rollback**:
- Vercel keeps deployment history
- One-click rollback to previous deployment
- Instant rollback (no rebuild needed)

---

## Option 2: Netlify

**Initial Setup**:
```bash
# Install Netlify CLI (optional)
npm i -g netlify-cli

# Login to Netlify
netlify login

# Deploy
netlify deploy --prod
```

**Automatic CI/CD with Netlify**:

1. **Connect Repository**:
   - Go to [netlify.com](https://netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect to Git provider
   - Select repository

2. **Build Settings**:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Auto-detected for Vite

3. **Environment Variables**:
   - Site settings → Environment variables
   - Add all `VITE_*` variables
   - Deploy contexts: Production, Deploy Previews, Branch deploys

4. **Automatic Deployments**:
   - **Production**: Push to `main` → production deploy
   - **Deploy Previews**: Pull requests → preview URL
   - **Branch Deploys**: Configure specific branches for staging

5. **Domain & HTTPS**:
   - Free subdomain: `your-project.netlify.app`
   - Custom domain support
   - Auto HTTPS/SSL

**Netlify CI/CD Flow**:
```
Git Push → Webhook → Build Container → npm install → npm run build → Deploy → CDN Distribution
```

**Additional Netlify Features**:
- Build plugins for optimization
- Split testing (A/B testing)
- Form handling
- Serverless functions (if needed later)

---

## Deployment Requirements

**Critical**:
- **HTTPS is mandatory** (camera API + PWA + Service Workers)
- Environment variables must be prefixed with `VITE_`
- Both Vercel and Netlify provide HTTPS automatically

**Pre-Deployment Checklist**:
- [ ] All environment variables configured
- [ ] Supabase project is in production mode
- [ ] Test production build locally: `npm run build && npm run preview`
- [ ] Verify camera works on HTTPS
- [ ] Test PWA installation
- [ ] Verify offline functionality

---

## CI/CD Comparison: Vercel vs Netlify

| Feature | Vercel | Netlify |
|---------|--------|---------|
| **Auto CI/CD** | Yes | Yes |
| **Preview Deploys** | Every PR | Every PR |
| **Build Time** | Fast (~2 min) | Fast (~2 min) |
| **Rollback** | Instant | Instant |
| **Custom Domain** | Free | Free |
| **HTTPS/SSL** | Auto | Auto |
| **Build Minutes** | 6000/month (Hobby) | 300/month (Free) |
| **Bandwidth** | 100GB/month | 100GB/month |
| **Vite Optimized** | Yes | Yes |
| **Edge Functions** | Yes | Yes |
| **Best For** | Vite/React apps | All static sites |

**Recommendation**: Use **Vercel** for this project (better Vite integration, faster builds, more generous free tier).

---

## Manual CI/CD with GitHub Actions (Optional)

If you need custom CI/CD pipeline:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests (when added)
        run: npm test --if-present

      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          VITE_GEMINI_API_KEY: ${{ secrets.VITE_GEMINI_API_KEY }}

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

**Note**: Manual CI/CD is **not needed** if using Vercel/Netlify's built-in CI/CD (which is simpler and recommended).
