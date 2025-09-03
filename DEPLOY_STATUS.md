## Pi Hackathon App — Deployment Checkpoint

This file captures the current deployment state so we can resume quickly.

### Repository
- Repo: `Brian496/pi-hackathon-app`
- Branch: `main`
- Latest deploy commit: `a3828eb` — "Render: use dynamic PORT (remove fixed PORT env)"

### Render Blueprint
- Blueprint Name: Pi Hackathon
- Blueprint ID: `exs-d2r7mh2dbo4c73culch0`
- Root `render.yaml`: present (free-tier compatible)
- Service defined: `pi-app-backend`
- Plan: free (no disk)
- rootDir: `pi-app-template`
- buildCommand: `cd backend && npm install --omit=dev`
- startCommand: `cd backend && node src/server.js`

### Render Service
- Service: `pi-app-backend`
- URL: https://pi-app-backend-wm2v.onrender.com
- Notes: Free instances sleep; first request may be slow.

### Environment Variables (Render → Service → Environment)
- Required now (demo):
  - `ADMIN_USER` = set
  - `ADMIN_PASS` = set
  - `WEBHOOK_SECRET` = set
  - `CORS_ORIGIN` = `https://pi-app-backend-wm2v.onrender.com`
  - `PI_STRICT_VERIFY` = `false`
- For production (strict verify):
  - `PI_STRICT_VERIFY` = `true`
  - `PI_API_BASE` = (from Pi Dev portal)
  - `PI_API_SECRET` = (from Pi Dev portal)

### Storage
- `SQLITE_PATH` = `/tmp/dev.sqlite` (ephemeral on free tier; resets on redeploy)

### Endpoints
- Debug env: `/_debug/env`
- Frontend index: `/`
- Admin UI: `/admin.html`

### Local Development
- Backend: `pi-app-template/backend`
- Useful command to free port: `fuser -k 5051/tcp || true`
- Start (example):
  - `ALLOW_INLINE_SCRIPTS=true npm start`
- Debug env locally: `http://localhost:5051/_debug/env`

### Security Notes
- Helmet CSP is enabled; inline scripts are allowed only when `ALLOW_INLINE_SCRIPTS=true` (dev only).
- Webhook HMAC and idempotency implemented in backend.

### Resume Steps
1) Set/verify env vars in Render (see above).
2) Manual Deploy → Clear cache & deploy.
3) Open service URL → `/_debug/env` to confirm envs.
4) Use `/` and `/admin.html` for demo.


