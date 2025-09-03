# Pi App Template (Auth + Payments + Idempotency + Webhook Validation)

Minimal scaffold to kickstart a Pi App with secure server-side flows.

## Structure
- backend/ — Express server (server-verified auth and payments, idempotency, webhook HMAC)
- frontend/ — Static demo page to exercise flows

## Quick Start
```bash
# Backend
cd backend
npm install
npm run dev  # or: npm start
# Server runs on :5050

# Frontend
# Open http://localhost:5051/ (served by backend) or open frontend/index.html
```

## Docker / Compose
```bash
cd /home/vega/projects/lbry-desktop/pi-app-template
docker compose up --build -d
# Backend on :5050, Postgres on :5432

# Logs
docker compose logs -f backend

# Stop
docker compose down -v
```

Environment (Compose)
- Edit `docker-compose.yml` to set `PI_API_BASE` and `PI_API_SECRET` for real verification
- Backend env is defined inline; Postgres data persists via `pgdata` volume

## Environment
- PORT (default 5050)
- CORS_ORIGIN (default *)
- WEBHOOK_SECRET (HMAC secret for /api/webhooks/pi)
- Postgres: either DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE/PGSSL
- Pi API: PI_API_BASE and PI_API_SECRET for real server-side verification
 - SQLite fallback: set SQLITE_PATH (file) or omit for in-memory
 - Admin auth: set ADMIN_USER and ADMIN_PASS to protect /admin endpoints

### Enable strict server-side verification
Set these to use real Pi APIs and disable stubs:
```bash
export PI_API_BASE='https://api.minepi.com'   # or your proxy
export PI_API_SECRET='your_server_secret'
export PI_STRICT_VERIFY=true
```
With `PI_STRICT_VERIFY=true`, login and payments will fail unless the Pi API calls succeed.

### Protect admin endpoints
```bash
export ADMIN_USER='admin'
export ADMIN_PASS='strong-password'
```
Then open `http://localhost:5051/admin.html` and enter basic auth credentials when prompted.

## Notes
- Replace stubs with real Pi SDK calls:
  - verifyPiAuthToken(idToken)
  - verifyPiPaymentOnServer(paymentId)
- Add persistent storage for sessions and receipts.
- Add proper auth cookies/tokens and CSRF protection as needed.
 - If Postgres is not configured, the server falls back to in-memory stores.

## Protected Content Demo
- After a successful payment (status APPROVED), click "Get Protected Content" on the demo page.
- The backend checks for an APPROVED receipt linked to your session’s userId and returns a protected payload.

## Security Checklist (short)
- Verify auth tokens and payments on the server
- Enforce idempotency on fulfillment
- Validate webhook signatures and timestamps
- Rate-limit sensitive endpoints
- Don’t store unnecessary PII; encrypt where needed

## License
MIT
