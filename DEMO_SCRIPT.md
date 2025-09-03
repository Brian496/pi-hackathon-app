# Demo Script (3–5 Minutes)

1) Intro (10–15s)
- One-liner: A secure Pi App starter with server-verified auth/payments, idempotent fulfillment, and admin audit.

2) User Flow (2–3m)
- Open `http://localhost:5051/` (or hosted URL)
- Login: paste token (with strict verify enabled, use a real token) → show sessionId
- Payments:
  - Create (amount=1), Confirm → show status APPROVED
- Unlock:
  - Click “Get Protected Content” → payload returned (unlocked)

3) Admin/Audit (45–60s)
- Open `http://localhost:5051/admin.html` → basic auth
- Show Sessions and Receipts
  - Filter by query/status/date
  - Export CSV

4) Security & Compliance (30–45s)
- Server-side verification of auth and payments (strict mode)
- Idempotent fulfillment and receipts store
- Webhook HMAC validation hook
- Basic auth on admin; SQLite/Postgres persistence

5) Close (15–20s)
- Roadmap: plug-in real use-case (tips/paywalls/microtasks), deploy, iterate.
- Call to action: ready for mainnet listing review.
