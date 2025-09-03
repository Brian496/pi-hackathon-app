# Pi Hackathon 2025 Submission — Starter App

Production-minded starter demonstrating: server-verified auth and payments (Pi), idempotent fulfillment, webhook verification hooks, protected content, and admin/audit UI.

## 1) Quick Start (Local)
```bash
# Backend
cd pi-app-template/backend
npm install
export ADMIN_USER='admin' ADMIN_PASS='strong'
export SQLITE_PATH=./dev.sqlite PORT=5051
npm start
# App:    http://localhost:5051/
# Admin:  http://localhost:5051/admin.html
```

## 2) Strict Server Verification (real Pi APIs)
```bash
# Use real endpoints or your secure proxy
export PI_API_BASE='https://api.minepi.com'
export PI_API_SECRET='REPLACE_WITH_SERVER_SECRET'
export PI_STRICT_VERIFY=true   # disables stubs; login/payments must verify server-side
```

## 3) Admin Protection
- Endpoints under `/admin` require basic auth.
- Set env: `ADMIN_USER`, `ADMIN_PASS`.

## 4) Features to Demo
- Login (server verifies token if strict verify is enabled)
- Create Payment → Confirm Payment (server verification + idempotent fulfillment)
- Protected Content (unlocked after an APPROVED receipt)
- Admin audit: sessions, receipts, filtering, CSV export

## 5) Webhook Security (hook provided)
- Endpoint: `POST /api/webhooks/pi`
- Validates `x-signature` HMAC with `WEBHOOK_SECRET` (extend with timestamp/replay checks).

## 6) Environment Variables
- App: `PORT`, `CORS_ORIGIN`
- Storage: `SQLITE_PATH` (or Postgres via `DATABASE_URL` or `PG*` vars)
- Pi API: `PI_API_BASE`, `PI_API_SECRET`, `PI_STRICT_VERIFY`
- Webhooks: `WEBHOOK_SECRET`
- Admin: `ADMIN_USER`, `ADMIN_PASS`

See `pi-app-template/backend/ENV_EXAMPLE` for a ready-to-copy template.

## 7) Deploy (example)
- Render/Railway/Fly: deploy the backend as a Node service.
- Set env vars above; use persistent disk for SQLite or attach Postgres.
- Enforce HTTPS, set `CORS_ORIGIN` to your site.

## 8) Submission Checklist
- Working hosted demo URL
- Developer Portal listing, screenshots
- Video (3–5 min):
  - Problem → Walkthrough (Login → Create → Confirm → Unlock)
  - Admin/audit view (filters/CSV)
  - Security: strict verify on, idempotency, webhook validation, admin auth
  - Next steps/roadmap
- README link (this file)
- All team members KYC completed

## 8.1) Demo Video
- Filename suggestion: `pi-hackathon-demo_YYYY-MM-DD_v1.mp4`
- Local path suggestion: `pi-app-template/demo/pi-hackathon-demo_YYYY-MM-DD_v1.mp4`
- Public link (preferred): Unlisted YouTube or Drive link here: <ADD LINK>
 - Public link (preferred): [YouTube](https://youtu.be/w2g0PmZw06U)
- Contents shown: Login → Create → Confirm → Protected Content; Admin sessions/receipts + CSV

## 9) Notes for Reviewers
- Protected content is returned by `POST /api/protected` after one APPROVED receipt per user.
- Admin endpoints are read-only and require basic auth.

---
Contact: add your email/handle here.
