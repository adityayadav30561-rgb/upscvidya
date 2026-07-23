# ENTITLEMENTS — free vs premium (build book Prompt 14)

The single source of truth for what each tier can do. Every gated surface asks
the **same** server-side question through `pb/pb_hooks/lib/entitle.js`
(`entitled(user, { free })` = `free || isPremium || isAdmin`, where `isPremium`
also respects `premium_until`). The client never decides entitlement or price.

> Premium plans (one-time, not subscriptions): **Monthly ₹199** (₹99 beta) = 30
> days · **Till-exam ₹999** (₹499 beta) = access to 2027-08-31. Beta price
> applies to holders of the `beta_founder` badge, priced server-side only.

## Matrix

| # | Feature | Free | Premium | Enforced by |
|---|---------|------|---------|-------------|
| 1 | PYQ Vault (browse + attempt, all papers) | ✅ full | ✅ full | `pyq.pb.js` (public by design) |
| 2 | Territory reading — **Foundations** / any `is_free` topic | ✅ | ✅ | `topics` view rule (`is_free`) |
| 3 | Territory reading — all other regions | 🔒 | ✅ | `topics` list/view rule (`is_premium`) |
| 4 | Topic quiz — free topic | ✅ | ✅ | `quiz.pb.js /start` → `entitled` |
| 5 | Topic quiz — premium topic | 🔒 | ✅ | `quiz.pb.js /start` → `entitled` |
| 6 | Appendix **drills** (APX-*) | ✅ | ✅ | `quiz.pb.js` (drills always free) |
| 7 | Revision Stack (SR) — free-topic cards | ✅ | ✅ | `sr.pb.js /restore` → `entitled` |
| 8 | Revision Stack (SR) — premium-topic cards | 🔒 | ✅ | `sr.pb.js /restore` → `entitled` |
| 9 | Sectionals | 1 / month | ✅ unlimited | `test.pb.js /sectional` (IST-month count) |
| 10 | Mocks — the free paper (`is_free`) | ✅ | ✅ | `test.pb.js /start`, `/catalogue.locked` |
| 11 | Mocks — all other papers | 🔒 | ✅ | `test.pb.js /start` → `entitled` |
| 12 | Daily Briefing — today + yesterday | ✅ | ✅ | `ca.pb.js /briefing` |
| 13 | Daily Briefing — older archive | 🔒 | ✅ | `ca.pb.js /briefing` (date gate) |
| 14 | Daily CA mini-quiz + XP | ✅ | ✅ | `ca.pb.js /answer`, `/complete` |
| 15 | XP · ranks · streaks · battalion board | ✅ | ✅ | not gated (engagement is universal) |
| 16 | Referrals (earn +7 days on a referral) | ✅ | ✅ | `quiz.pb.js /finish` → `grantReferralCredit` |

🔒 = blocked for free users (server returns `403 { code: "premium_required" }`);
the client surfaces the paywall (Screen 15) with the context that hit the wall.

## Notes

- **Row 9 (sectionals):** a free user may compose one sectional per IST calendar
  month; the second returns `premium_required`. Premium/admin unlimited.
- **Row 13 (archive):** free = `date ∈ {today, yesterday}`; older dates return
  `locked` with **no items** in the payload (never trimmed client-side).
- **Rows 2/3:** free users physically cannot fetch a gated topic's `notes_md`
  (row-level view rule); the reader falls back to the SQL-trimmed
  `topics_teaser` (~120 words) → paywall.
- **Expiry:** the nightly `premium_expiry` cron clears `is_premium` once
  `premium_until` passes, so the API rules stay truthful between requests; the
  entitlement helper double-checks the date regardless.

## Verification

- Server unit truth: `src/lib/__tests__/pay.test.ts` (pricing, beta, plan math).
- e2e (run with `PAY_SIMULATE=1` on the PocketBase server — no live Razorpay
  keys needed; see `pb/SCHEMA.md` § Payments):
  - `e2e/payment.spec.ts` — both plans flip free→premium; paywall wall.
  - `e2e/payment-webhook.spec.ts` — **replayed webhook does not double-extend**
    (server-level; asserts `premium_until` unchanged on replay + single ledger
    row), plus a distinct-order control that *does* extend.
  - `e2e/referral-grant.spec.ts` — **first quiz completion credits BOTH parties
    exactly once** (+7 banked days each; a second quiz grants nothing; a
    referrer-less user earns nothing). Uses free topic POL-05 (live questions).
  - `e2e/referral.spec.ts` — referral link/share surfaces.
