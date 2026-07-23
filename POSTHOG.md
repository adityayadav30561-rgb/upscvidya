# PostHog — analytics setup (build book Prompt 15)

UPSCVidya sends a curated funnel to PostHog via a thin HTTP client
([src/lib/analytics.ts](src/lib/analytics.ts)) — no SDK, no autocapture. Events
identify by **PB user id** (the `distinct_id`); person properties are set via an
`$identify` event. **No PII** ships in payloads (`sanitize()` strips
email/name/phone/etc.), and the **"minimal analytics"** setting suppresses every
event except `signup_completed`, `onboarding_completed`, `payment_success`.

## Configure

Set the client keys (see `.env.example`); unset = analytics is a no-op:

```
PUBLIC_POSTHOG_KEY=phc_xxxxxxxx
PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   # or eu.i.posthog.com
```

## Events captured

| Event | Fired from | Notable props (no PII) |
|-------|-----------|------------------------|
| `signup_completed` | auth signup | `referred` |
| `onboarding_completed` | onboarding save | `target_year`, `daily_minutes` |
| `first_topic_read` | reader @80% scroll | `code` |
| `first_quiz_completed` | quiz finish (topic) | `code`, `score_pct` |
| `topic_conquered` | quiz finish (≥70%) | `code`, `gold` |
| `sr_session_completed` | revision session end | `graded` |
| `mock_started` | test centre → start mock | `test_id`, `free` |
| `mock_submitted` | mock submit | `test_id`, `score` |
| `paywall_viewed` | paywall mount | `from` |
| `checkout_started` | checkout pay tap | `plan` |
| `payment_success` | checkout success | `plan` |
| `ca_quiz_completed` | daily briefing quiz | `date` |
| `referral_shared` | profile share | — |

Person properties (`$set`): `rank`, `premium`, `target_year`.

## The 4 saved insights to create manually

PostHog cloud → **Insights → New**. Create and save each; pin to a "UPSCVidya
Launch" dashboard.

### 1. Activation funnel
- Type: **Funnel**. Steps, in order:
  `signup_completed` → `onboarding_completed` → `first_topic_read` →
  `first_quiz_completed` → `topic_conquered`.
- Conversion window: **7 days**. Breakdown by person property `target_year`.
- Watches: the biggest drop-off step is the activation bottleneck to fix.

### 2. Retention (D1 / D7 / D30) by cohort
- Type: **Retention**. "First time" event: `signup_completed`.
- "Returning" event: **any** of `first_quiz_completed`, `sr_session_completed`,
  `ca_quiz_completed` (a qualifying-activity return — matches the streak rule).
- Period: **Daily**, show D1/D7/D30 columns. Breakdown by weekly signup cohort.

### 3. Free → paid conversion
- Type: **Funnel**: `paywall_viewed` → `checkout_started` → `payment_success`.
- Conversion window: **24 hours**. Breakdown by `plan` (property on the last
  two steps) to compare monthly vs till-exam.
- Secondary: trend of `payment_success` count / week.

### 4. Feature-usage breakdown
- Type: **Trends**, one series per feature event: `first_quiz_completed`,
  `sr_session_completed`, `mock_started`, `ca_quiz_completed`,
  `referral_shared`. Display **weekly active users** (unique users) per series.
- Reveals which loops carry engagement vs. which are ignored.

## Verification (acceptance)

"All listed events appear with correct properties" is confirmed by capturing the
`analytics.test.ts` gate/sanitize unit truth plus a live run against a PostHog
project (set the keys, do a full golden-path pass, watch **Activity → Live
events**). The gate (`shouldCapture`) and PII stripping (`sanitize`) are unit
tested so payload shape never regresses.
