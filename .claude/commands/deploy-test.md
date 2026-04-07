---
allowed-tools: Bash(npm:*, vercel:*, git:*)
description: Deploy EntryFlow app to Vercel preview environment for testing
argument-hint: [optional-message]
---

# Deploy to Test Environment

Deploy the EntryFlow PWA to a Vercel preview environment for testing.

## Context

- **Project**: EntryFlow - Offline-first PWA for condominium security gate management
- **Stack**: React 19 + TypeScript, Vite 6, Supabase backend
- **Build command**: `npm run build`
- **Deploy platform**: Vercel (preview deployment)
- **Requirements**: HTTPS required for camera access and PWA features

## Pre-Deployment Checks

Before deploying:
1. Verify environment variables are configured in Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GEMINI_API_KEY`
2. Ensure latest changes are committed to git
3. Check that production build completes successfully

## Deployment Instructions

Execute the following steps:

1. **Navigate to project root**:
   ```bash
   cd /mnt/c/CHONG/CHONGTECHNOLOGIES/PROJECTS/ELITECONDOGUARD/APPGUARD/src
   ```

2. **Run production build** to verify it works:
   ```bash
   npm run build
   ```

3. **Deploy to Vercel preview environment**:
   ```bash
   vercel
   ```

   This creates a preview deployment (not production). If you need production deployment, use `vercel --prod` instead.

4. **Provide the preview URL** to the user so they can test:
   - PWA installation
   - Camera functionality (HTTPS required)
   - Offline functionality
   - Service Worker updates

## Post-Deployment

After deployment completes:
- Share the preview URL
- Remind user to test critical features:
  - Device configuration (/setup)
  - Guard login
  - Camera capture in NewEntry
  - Offline mode
  - PWA installation

## Notes

- Preview deployments are temporary testing environments
- Automatic deployments from `main` branch go to production via Vercel CI/CD
- Use preview deployments for testing PRs or feature branches
- Each preview deployment gets a unique URL
