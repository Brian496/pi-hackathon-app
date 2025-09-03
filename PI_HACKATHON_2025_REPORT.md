# Pi Hackathon 2025 — Strategic Brief for Builders and Security Review

This brief turns official details into an engineering-ready plan: what matters, how to build, and how to avoid common pitfalls.

## 1) Event Overview
- Organizer: Pi Network
- Focus: Build Pi Apps that deliver real-world utility for everyday users
- Context: First major hackathon in the Open Network era

## 2) Timeline & Prizes
- Registration opens: Aug 15, 2025
- Hackathon: Aug 21 → Oct 15, 2025
- Midpoint check-in: Sep 19, 2025
- Total prize pool: 160,000 Pi
  - 1st: 75,000 Pi
  - 2nd: 45,000 Pi
  - 3rd: 15,000 Pi
  - Honorable mentions (up to 5): 5,000 Pi each

References:
- Announcement: https://minepi.com/blog/pi-hackathon-2025/
- Begins: https://minepi.com/blog/pi-hackathon-2025-begins/

## 3) Participation & Compliance
- Team size: Flexible; collaboration encouraged
- Prize eligibility: All members must pass Pi KYC
- Submission: App listing via Developer Portal + demo video + submission form by Oct 15
- Adherence: Mainnet Listing Requirements; consider PiOS (Pi Open Source) when applicable

References:
- Developer Portal: https://minepi.com/developers/
- Hackathon instructions / listing rules: https://minepi.com/hackathon-instructions/
- PiOS: https://minepi.com/pios/

## 4) Judging Signals (what scores well)
- Utility & impact: Solves a real user problem; adoption potential is clear
- Execution quality: Smooth flows, responsive UI, minimal friction onboarding
- Technical rigor: Correct Pi SDK use; server-verified auth and payments
- Ecosystem fit: Aligned with everyday accessibility and Pi usage
- Mainnet readiness: Listing compliance; production posture

## 5) Platform & Tools
- Pi App Studio: Rapid scaffolding for Pi Apps
- Brainstorm app: Teaming, ideation, early feedback
- Developer Portal: Registration, listing, submissions
- Pi SDK (typical stack):
  - Sign in with Pi (auth)
  - Payments (request, verify server-side, fulfill idempotently)
  - Web/JS client + backend with secure webhook/callback validation

## 6) High-ROI Themes (examples)
- Commerce & tipping: Paywalls, donations, creator tipping in Pi
- Microtasks & gigs: Proof-of-completion + escrowed payouts
- Local services & markets: Listings, reservations, deposits
- Content & education: Micropayments for lessons/quizzes
- Reputation & verification: KYC-gated features; anti-sybil patterns

## 7) Security & Abuse-Resistance (checklist)
- Authentication
  - Verify Sign in with Pi tokens server-side; never trust client identity claims
  - Bind sessions to secure cookies/tokens; short lifetimes + refresh
- Payments
  - Treat client intents as untrusted; verify on server with Pi API
  - Enforce idempotency keys on fulfillment; prevent duplicates
  - Persist receipts: payment_id, amount, payer_id, status, signature, timestamp
- Webhooks/Callbacks
  - Validate signatures + timestamps; reject replays
  - Prefer allowlists; otherwise use HMAC nonces with expiry
- Data & Privacy
  - Minimize PII; encrypt at rest; redact logs
  - Restrict access; comply with KYC handling
- Rate Limiting & Fraud
  - Throttle signups/payments; device/IP/user velocity checks
  - Anti-farming for microtasks: CAPTCHA, randomized audits, reputation
- Client Integrity
  - No secrets in frontend; use server env and proxies
  - Enforce CSP, SameSite cookies, CSRF on state-changing routes
- Observability
  - Correlate auth, payment verification, and webhook events
  - Incident playbook: refunds/rollbacks/feature flags

## 8) Common Pitfalls
- Fulfilling content based on client state (no server verification)
- Missing idempotency leading to duplicate grants
- Accepting unsigned/unverifiable webhooks
- Over-collecting KYC/PII and leaking in logs
- No rate limits → botting/farming/brute force
- Commingling test/mainnet creds; secrets committed to repo

## 9) Reviewer-Friendly Submission Package
- App listing (description, screenshots, support)
- 3–5 min demo video: problem → demo → tech → results → next
- Technical README: architecture, data flows, SDK integration, config
- Security appendix: auth/payment verification, threat model, mitigations
- Roadmap: post-hackathon iterations, KPIs, GTM

## 10) Build Blueprint (reference plan)
- Week 0: Scope lock; choose 1–2 core journeys; define success metric
- Week 1: Auth + Payments; server verification; idempotent fulfillment; receipts; admin audit
- Week 2: End-to-end UX; empty/error states; rate limits; minimal analytics
- Week 3: Security hardening; monitoring; finalize demo + docs
- Final: UAT with 5–10 users; perf pass; package submission

## 11) Opportunity Map + Security Notes
- Paywalled articles + tipping → server-side metering; share-proofing
- Microtask verifier + escrow → state machine; dispute overrides
- Local marketplace deposits → robust refund/cancel; audit trail
- Learning quizzes → randomized banks; retry limits; throttling

## 12) Links (consolidated)
- Announcement: https://minepi.com/blog/pi-hackathon-2025/
- Begins: https://minepi.com/blog/pi-hackathon-2025-begins/
- Hackathon instructions: https://minepi.com/hackathon-instructions/
- Developer Portal: https://minepi.com/developers/
- PiOS: https://minepi.com/pios/

---
If useful, I can scaffold a reference Pi App (auth + payments + idempotent fulfillment + webhook verification) that your team can fork and skin with your UX.
