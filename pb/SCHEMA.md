# UPSCVidya — PocketBase Schema

Source of truth: [pb_migrations/1752900000_init_schema.js](pb_migrations/1752900000_init_schema.js).
A fresh PocketBase + these migrations reproduces the schema exactly.

## Running locally (dev)

```bash
# from repo root, with a pocketbase binary in pb/:
cd pb && ./pocketbase serve --dev
# admin UI: http://127.0.0.1:8090/_/  → create first superuser
# then seed:
PB_URL=http://127.0.0.1:8090 PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node seed/seed.js
```

Migrations in `pb_migrations/` and hooks in `pb_hooks/` auto-load from the
working directory. On the VPS they live at `/opt/pocketbase/` (deployed by
`infra/setup.sh`).

## notes_md gating strategy (the chosen approach)

PocketBase has no field-level rules, so:

1. **`topics`** (the real collection, incl. `notes_md`) — list/view rule:
   `status = "live" && (is_free = true || @request.auth.is_premium = true || @request.auth.role = "admin")`
   Free users can never fetch a gated topic's record, so `notes_md` never leaks.
2. **`topics_public`** (view collection) — every field EXCEPT `notes_md`, only
   `status = 'live'` rows, fully public. The territory map and topic lists read
   this; it powers anonymous/free browsing.
3. **`topics_teaser`** (view collection, Prompt 06) — `substr(notes_md,1,700)`
   as `notes_teaser` plus a `teaser_truncated` flag, all `status='live'` rows,
   fully public. The reader falls back to this when a free user opens a gated
   topic, so the ~120-word preview is trimmed in SQL: the network response for a
   gated topic can only ever carry the teaser, never the full `notes_md`.
   Migration: [pb_migrations/1753000000_topics_teaser.js](pb_migrations/1753000000_topics_teaser.js).

## Quiz engine (Prompt 07)

**`quiz_sessions`** (base collection) holds a composed quiz server-side: each
item stores the question, the display-ordered options, and the original-index
`map` used to verify answers. `answer_index` never leaves the server —
`/api/quiz/*` returns only the display index the client renders. Clients may
READ their own sessions (resume); only the hooks write.
Migration: [pb_migrations/1753100000_quiz_sessions.js](pb_migrations/1753100000_quiz_sessions.js).

Endpoints (superuser context, [pb_hooks/quiz.pb.js](pb_hooks/quiz.pb.js)):
`POST /api/quiz/start` composes the topic's **entire live pool** — `N =
pool.length`, no cap and no floor, so a chapter with 50 authored questions
serves all 50. Tier buckets (30/40/30) still order the picks, preferring
least-attempted-by-this-user; reuses an
active session so a refresh resumes. `/answer` verifies + records an attempt +
bumps question stats. `/state` resumes (reveals correct index only for answered
questions). `/finish` scores, upserts `topic_progress` (≥70% conquered, ≥90%
second-pass-with-all-tiers gold, never downgrades), enqueues each wrong answer
into `sr_cards` (dup-guarded), and awards XP (`10·correct + 50 pass + 30 gold`;
rank ladder mirrors `src/lib/ranks.ts`). XP/rank logic is provisional — Prompt
09 formalises it.

**Dev note:** the engine reads `status='live'` questions only. Seed questions
ship as `draft` (provenance workflow); promote them to `live` for local testing
(the admin queue in Prompt 13 does this in production). `pb_data` is gitignored,
so this promotion is per-environment.

## Spaced repetition (Prompt 08)

Endpoints in [pb_hooks/sr.pb.js](pb_hooks/sr.pb.js): `POST /api/sr/due`
(count + batch capped at 60/day, overdue first then ease ascending, 7-day
forecast, decaying-territory warnings — no answers in the payload),
`/reveal` (answer + explanation for one owned card), `/grade`
(`again|good|easy|mastered`), `/restore` (5-question micro-quiz from the
territory's most-missed-by-this-user questions, reusing `quiz_sessions`; the
normal `/api/quiz/finish` pass restores `conquered` and refreshes
`last_activity`, and a fail keeps `decaying` — never downgrades).

SM-2 tuning (canonical implementation + documented table:
`src/lib/sr.ts` / `src/lib/__tests__/sr.test.ts` — the hook inlines the same
math): `again` = lapse (reps 0, 1d, ease −0.2 floored at 1.3, lapses+1);
`good`/`easy` = rep1→1d, rep2→6d, then round(interval·ease) capped at 60d;
`easy` adds +0.1 ease; `mastered` suspends the card (design's deliberate,
button-only retirement). The UI exposes Again/Good/Mastered per Screen 07;
`easy` remains an engine grade per the build-book acceptance tests.

## Progression (Prompt 09)

The single awardXP path lives in [pb_hooks/lib/xp.js](pb_hooks/lib/xp.js) — a
CommonJS module `require`d by the quiz/SR handlers (clients never write XP).
Every award appends an `xp_events` row (weekly sparkline, Prompt 10 boards)
and re-derives `rank_code` from the 14-grade ladder (mirrors `src/lib/ranks.ts`;
`src/lib/xp.ts` + its test table guard the math on both sides).

Rules: correct topic-quiz answer `10 × tier-mult` (T1-2 ×1.0, T3 ×1.4, T4 ×1.8,
T5 ×2.2); anti-farm — a repeat correct on the same question within 7 days earns
0 (flagged at answer time; SR exempt); SR review 8 flat / 12 if ever lapsed,
`again` 0; conquest +100, gold +150 (replaces), region complete +500 (checked
against master-doc chapter counts, so partial live content can't fire it);
drill flat 40; mock 200+ (P11); daily CA 30 (P13).

Streaks: IST days; a day counts on topic-quiz finish or the day's 10th SR
review. Gaps auto-burn freezes (2/month, refilled by the `freeze_refill` cron);
a gap beyond the remaining freezes resets to 1. Milestones 7/30/100 award
badges. `badges` + `xp_events` collections ship in
[pb_migrations/1753200000_xp_badges.js](pb_migrations/1753200000_xp_badges.js);
badge codes: `first_conquest`, `region_<code>` ×8, `streak_7/30/100`,
`pet_ready` (P16), `mock_finisher` (P11), `beta_founder` (P18).

## Battalion leaderboards (Prompt 10)

`awardXP` also upserts this week's `leaderboard_entries` row (keyed
`(user, week_start)` with `week_start` = Monday 00:00 IST), so standings are a
side effect of the single XP path — nothing else writes them.

**Privacy.** `users` is self-read only (`id = @request.auth.id`), so a client
can never list other aspirants. [pb_hooks/board.pb.js](pb_hooks/board.pb.js)
assembles `POST /api/board` server-side and emits only `display_name`
(or `"Anonymous Cadet"` when that user set the `anonymous` flag —
[migration](pb_migrations/1753300000_anonymous_toggle.js)), `rank_code`,
`streak` and `xp_week`. No emails, no user ids. The owner always sees their own
real name on their own row; the mask applies to other viewers only.

The `leaderboard_rollover` cron (Monday 00:00 IST) snapshots the **closing**
week before stamping the new `week_start`: top 3 earn `podium_1/2/3`, top 5
earn `commendation` (unique `(user, code)` index makes it idempotent). Past
weeks are never mutated, so history and the ▲/▼ week-over-week delta survive.

## Test centre (Prompt 11)

[pb_hooks/test.pb.js](pb_hooks/test.pb.js): `/api/test/catalogue` (mocks +
attempt history), `/sectional` (compose from the chosen regions/tier band with
the standard 30/40/30 weighting, 45s-per-question budget), `/start`
(mock entitlement + resume), `/state` (resume payload), `/submit`
(scoring, percentile, region/tier breakdown, full review).

**Exam conditions.** Unlike topic quizzes there is no immediate feedback:
`/state` serves only `qid, stem, options, tier, format, region` — never
`answer_index` or `explanation`. Options keep their authored order, so
`answers` is `qid → chosen original index` exactly as the schema intends.

**Timer honesty.** `started_at` is server-written and the `test_attempts`
updateRule blocks the client from touching it, so remaining time and the
submit cutoff always derive from the server clock. An `onRecordUpdateRequest`
hook additionally rejects answer writes once an attempt is submitted or past
`started_at + duration` (10s grace for the in-flight save at the bell) — a
tampered client clock buys no extra time.

Marking lives in `tests.config` (`{correct: 2, negative: 0.667}` = CAPF's
one-third penalty); `src/lib/test.ts` holds the documented reference
implementation and its unit tests. Percentile is recomputed on every submit
against all submitted attempts of that paper, so it moves as the cohort grows.
Mocks award `200 + round(200 × score-ratio)` XP through the Prompt 09 path plus
the `mock_finisher` badge. Papers seed from
[pb_migrations/1753400000_mock_tests.js](pb_migrations/1753400000_mock_tests.js)
with `question_ids: null`, meaning "compose from the live pool at start";
filling `question_ids` turns the same record into a fixed admin-authored paper.

**Dev note:** a mock composes `min(config.count, live pool)` questions, so with
the 30-question seed a "125 Q" paper runs as 30 until more content is live.

## PYQ Vault (Prompt 12)

Past papers live in the same `questions` collection with `source_type = 'pyq'`
and `source_meta = {exam, year, qno}`, authored under
`/content/pyq/CAPF-YYYY/mcqs.json` and handled by the same validator/sync
(a PYQ folder has no `topic.md` — each question names the syllabus `topic`
id_code it belongs to, which drives the topic chip).

**Public by design.** `questions` is admin-listable only, so
[pb_hooks/pyq.pb.js](pb_hooks/pyq.pb.js) is the sole public surface and serves
PYQs *only*: `/api/pyq/index` (years + topic breakdown), `/paper`
(questions with **no** `answer_index` or `explanation`), `/check` (reveals the
verdict + explanation for one question), `/attempt-paper` (auth required —
routes a whole year through the standard test engine as a free paper).
A logged-out visitor can browse and attempt inline; a session simply upgrades
the response with attempt state, records attempts (`context = 'pyq'`) and
feeds wrong answers into `sr_cards`.

SEO: `/pyq/capf-YYYY` is **prerendered** to static HTML from
`src/lib/pyq-snapshot.json` (regenerate with `pnpm pyq:snapshot`), so the build
needs no live PocketBase. Those pages publish counts and a topic breakdown
only — never the questions.

## Current affairs (Prompt 13)

The pipeline job lives at [../infra/jobs/ca-pipeline/index.js](../infra/jobs/ca-pipeline/index.js)
(cron 05:30 + 17:30 IST on the VPS): fetches every enabled `sources` feed,
filters noise, dedups by URL + Jaccard title similarity against 14 days of
`ca_items`, then drafts per candidate — with an AI key a real model call
(summary, topic tags, 2-3 draft MCQs); without a key it runs in HEURISTIC mode
(keyword tags, extractive summary, NO fabricated MCQs) at `confidence 0.5`,
which keeps every heuristic draft below the 0.92 batch-approve bar so a human
reads it. Runs log to `jobs_log`; a non-zero exit is the alerting signal.
NOTE: PIB's RSS returns Hindi headline-only items, so English national feeds
(The Hindu, Indian Express) ship as additional seeded `sources` rows —
admin-editable, exactly as the build book intended.

[pb_hooks/ca.pb.js](pb_hooks/ca.pb.js): `/api/ca/briefing` (date-gated feed —
free tier gets today + yesterday, older dates return `locked` with NO items;
premium/admin get the archive), `/answer` (mini-quiz check: first attempt
recorded as `daily_ca`, misses feed `sr_cards`), `/complete` (30 XP once per
IST day + streak), and the admin set `/queue`, `/approve`, `/reject`,
`/publish-question`, `/batch`. Approval is ATOMIC — `runInTransaction` flips
the item to published and its draft questions to live together, stamps
`reviewed_by`/`reviewed_at`, and publishes today or 07:00 tomorrow when
approved after 20:00 IST. Batch approve only touches items with
`confidence >= 0.92`.

## Payments & referrals (Prompt 14)

Razorpay standard checkout (one-time, NOT subscriptions). Prices are computed
server-side in [pb_hooks/lib/entitle.js](pb_hooks/lib/entitle.js) — the single
entitlement/pricing/grant module (`require`d like `lib/xp.js`) — so a client can
never pick its own amount, and `beta_founder` holders get the 50% price
(monthly ₹199→₹99, till-exam ₹999→₹499). The struck MRP anchors (₹399/₹1999)
are display-only. `entitled(user, {free})` = `free || isPremium || isAdmin`, and
`isPremium` respects `premium_until` — every gated surface (quiz, sr, test, ca)
now asks this one question.

Endpoints ([pb_hooks/pay.pb.js](pb_hooks/pay.pb.js)):
`POST /api/pay/order` {plan} creates a Razorpay order + a `payments` row
(status=created); `/verify` validates the client callback HMAC
(`hs256(order_id|payment_id, key_secret)`) and grants; `/webhook` (public)
CONFIRMS via an authenticated server→Razorpay fetch of the order's payments
(stronger than a raw-body hash, which PB's JSVM can't reproduce byte-exact) and
grants; `/restore` re-derives entitlement from the user's paid payments.

**Idempotency / no-double-extend** (the key acceptance): the `payments` row —
unique on `razorpay_order_id` (migration
[1753600000](pb_migrations/1753600000_payments_referrals.js)) — is the ledger.
Premium is granted only on the created→paid transition inside `runInTransaction`,
so a replayed webhook OR a webhook racing the client callback extends access
exactly once.

**Referrals:** a referred user's first *topic-quiz finish* (quality gate, in
`quiz.pb.js /finish`) calls `entitle.grantReferralCredit`, granting +7 premium
days to BOTH parties. Idempotent via the unique `(user, referred_user)` index on
`referral_credits`; capped at 10 credits/user. A party who is already premium
gets `premium_until` extended immediately; a free party banks the days in the
new `users.premium_credit_days` field, which realises on their next purchase
("start-later credit").

**Dev/e2e without keys:** set `PAY_SIMULATE=1` (and no Razorpay keys) — `/order`
returns a synthetic order and `/verify` accepts the `"SIMULATED"` signature. The
client (`src/lib/pay.ts`) takes this path automatically. Never active in
production (keys present ⇒ simulation unreachable). Full free/premium matrix:
[ENTITLEMENTS.md](../ENTITLEMENTS.md).

## Push notifications & analytics (Prompt 15)

**Push (OneSignal).** The send path is [pb_hooks/lib/notify.js](pb_hooks/lib/notify.js)
(`require`d by cron.pb.js + notify.pb.js). Four cron sends — `briefing_push`
07:00, `streak_risk_push` 20:30, `sr_pileup_push` 18:00 (≥25 due, self-throttled
to once/3 days via `users.last_sr_push`), `battalion_weekly_push` Mon 08:00 IST.
Every send filters recipients through `wantsType()` **server-side**, so a
disabled toggle (`users.notification_prefs.<type> = false`) is never delivered;
a missing key defaults opted-in (no backfill). Targets OneSignal by
`external_id = PB user id` (client calls `OneSignal.login(userId)`). Unkeyed
(`ONESIGNAL_APP_ID`/`ONESIGNAL_REST_KEY` absent) ⇒ DRY mode: computes + logs the
audience, sends nothing. Endpoints [pb_hooks/notify.pb.js](pb_hooks/notify.pb.js):
`/api/notify/preview` {type} (auth, self — `would_receive` for the caller; how
the opt-out acceptance is verified without OneSignal) and `/api/notify/test`
{type} (admin — force-trigger a real send).

**Service-worker coexistence.** The app ships a hand-rolled SvelteKit SW at
`src/service-worker.ts` owning scope `/` (offline caching). OneSignal's worker
is scoped to **`/push/`** (`static/push/OneSignalSDKWorker.js` +
`serviceWorkerParam.scope` in `src/lib/push.ts`), so the two never contend for a
scope. The push permission prompt is **never** shown on load — only after the
first topic quiz (`promptAfterFirstQuiz()`), gated by `shouldPromptPush()`.

**Analytics (PostHog).** Thin HTTP client `src/lib/analytics.ts` (no SDK).
Identify by PB user id; person props `rank`/`premium`/`target_year`; no PII in
payloads; the `analytics_minimal` user flag suppresses all but the essential
funnel. Full event list + the 4 dashboards: [POSTHOG.md](../POSTHOG.md).

## Fitness — "The Drill Ground" (Prompt 16, pivoted from PET)

A training-only home-workout tracker (no official PET/PST). The exercise +
routine catalog lives as **client constants** (`src/lib/pt.ts`, like
`polity.ts`); the only new collection is `workout_logs`. Logging goes through an
**offline queue** (`src/lib/workout.svelte.ts`, localStorage) that syncs when
online; each log carries a client-generated `client_id` and `workout_logs` is
unique on **(user, client_id)**, so a re-flush collides and the log persists
exactly once.

Progression is HYBRID: [pb_hooks/pt.pb.js](pb_hooks/pt.pb.js) fires on a
workout_log create and, for the **first workout of the IST day**, awards ~40 XP
through the single `lib/xp` path (like a drill — study streak untouched),
advances a parallel **PT streak** (`users.pt_*`), and grants fitness badges
(`first_workout`, `circuit_finisher`, `pushups_50`, `plank_5min`, `run_5k`,
`regiment_30`). The "first of day" window is computed from the **UTC instants of
the IST calendar day** (logged_at is stored UTC — an IST-label-as-UTC-string
comparison would misfire by 5.5h). Readiness ring = distinct workout days this
week / `pt_weekly_goal`. Weekly "Time to train" nudge = the `pt_reminder`
notification type (Prompt-15 infra; Saturday 09:00 IST cron).

### workout_logs — unique (user, client_id)
`exercise_code`, `group`, `metric` (reps/time/distance/amrap), `sets` (json),
`total`, `best`, `source` (manual/routine), `routine_code`, `client_id`,
`logged_at`. Full CRUD on own rows; XP/streak are server-side (create hook).

## CA manual ingest + Monthly CA (post-Prompt-13)

[pb_hooks/ca_extra.pb.js](pb_hooks/ca_extra.pb.js) adds:
- `POST /api/ca/compose` (admin) — paste a day's raw notes → with an AI key
  (`OPENROUTER_API_KEY` → `GEMINI_API_KEY` → `MISTRAL_API_KEY` → `OPENCODE_API_KEY` → `GROQ_API_KEY`, or whichever
  `AI_PROVIDER` names) set (server env, `$os.getenv`,
  called via `$http.send`, 180s timeout) the model drafts
  briefs (60-90w) + 2-3 MCQs each, tagged to POL topics, inserted as `draft`
  ca_items + `draft` questions for the existing queue. Without a key it returns
  `422 { need_key }`, or the admin can POST a pre-structured `items` array to
  author manually. Nothing bypasses approval.
- `POST /api/ca/monthly-index` — months (YYYY-MM) that have published CA MCQs,
  with live-question + attempted counts; current IST month flagged.
- `POST /api/ca/monthly-start {month}` — unions every live CA MCQ published that
  month into a reusable `tests` record and starts an attempt through the
  standard test engine. Practice marking (+1, NO negative), a generous 2-min/Q
  budget. Current month free; older months premium (`entitle.js`).

Fixed alongside: the test engine coerced a legitimate `0` negative-marking (a
practice set) to the `0.667` default via `cfg.negative || 0.667` — now nullish-
guarded so 0 stays 0.

## Collections

### users (auth, extended)
| Field | Type | Notes |
|---|---|---|
| display_name, avatar_seed | text | |
| exam | select: capf | |
| target_year, daily_minutes | number | onboarding answers |
| xp | number | server-owned |
| rank_code | select: 14 grades (see ladder below) | server-owned; default `cadet` (create hook) |
| streak_current / streak_best / streak_freezes | number | server-owned; freezes default 2 |
| last_active_date | date | |
| battalion_id | relation→battalions | assigned by create hook |
| is_premium, premium_until, premium_plan | bool/date/select | server-owned (payments) |
| premium_credit_days | number | banked referral days (Prompt 14); server-owned |
| notification_prefs | json | `{type→bool}` push opt-outs (Prompt 15); self-editable; missing key = opted-in |
| analytics_minimal | bool | suppress non-essential analytics (Prompt 15); self-editable |
| last_sr_push | date | SR pile-up push throttle (Prompt 15); server-owned |
| pt_streak_current / pt_streak_best / pt_last_workout_date / pt_sessions_total | number/date | Drill Ground PT track (Prompt 16); server-owned |
| pt_weekly_goal | number | weekly workout goal (Prompt 16); self-editable; default 4 |
| tour_done | bool | Ustad first-run walkthrough seen; self-editable UX flag |
| featured_badges | json | up to 5 earned badge codes shown on the battalion board mini-profile; self-editable cosmetic list |
| referral_code | text, unique (partial index) | generated by create hook |
| referred_by | relation→users | set at signup via /r/[code] |
| role | select: user/admin | default `user` |

Rules: list/view/update own record only. The update rule blocks self-writes to
every server-owned field (`xp`, `rank_code`, premium fields, streaks, `role`,
`referral_code`, `referred_by`, `battalion_id`) via `@request.body.X:isset` guards.

#### Rank ladder — 14 grades (design Foundations §04 is source of truth)

The design supersedes the build book's 10-rank list. XP thresholds and the XP
hook (Prompt 09) follow this table. Client copy: `src/lib/ranks.ts`.

| code | rank | XP |
|---|---|---|
| cadet | Cadet | 0 |
| constable | Constable | 500 |
| sr_constable | Sr. Constable | 1,200 |
| head_constable | Head Constable | 2,200 |
| asi | Asst. Sub Inspector | 3,500 |
| si | Sub Inspector | 5,200 |
| inspector | Inspector | 7,500 |
| ac | Assistant Commandant | 10,500 · target rank |
| dc | Deputy Commandant | 14,500 |
| second_in_command | Second in Command | 19,500 |
| commandant | Commandant | 26,000 |
| dig | Dy. Inspector General | 34,000 |
| ig | Inspector General | 44,000 |
| dg | Director General | 56,000 |

### topics
`id_code` (unique), `title`, `part_no`, `region` (8 values: foundations, system,
centre, states, grassroots, institutions, dynamics, courtroom), `kind`
(chapter/appendix), `book_ref`, `mcq_floor`, `tags` (json), `guided_order`,
`est_read_minutes`, `prerequisites` (json), `notes_md` (editor), `status`
(draft/live), `is_free`.
Rules: entitled read only (see gating above). Writes: server/superuser only (content sync).

### topics_public (view)
All topic fields minus `notes_md`, `WHERE status = 'live'`. Public read.

### questions
`qid` (unique), `topic` (rel), `stem`, `options` (json[4]), `answer_index` (0-3),
`explanation`, `tier` (1-5), `format` (7 values), `exams` (json), `source_type`
(ai/self/external/pyq/ca), `source_meta` (json), `status`
(draft/validated/live/retired), `attempts_count`, `correct_count`.
Rules: **admin-only list/view — clients can never bulk-read questions or see
`answer_index`.** Quiz delivery happens through custom endpoints (Prompt 07)
that return live questions without `answer_index` and verify answers server-side.

### attempts
`user`, `question`, `topic` (rels), `context` (topic_quiz/sectional/mock/pyq/
daily_ca/sr_review/drill), `chosen_index`, `is_correct`, `time_taken_ms`,
`attempted_at` (autodate).
Rules: create/read own; immutable (no update/delete).

### topic_progress — unique (user, topic)
`state` (unread/read/conquered/gold/decaying), `best_score_pct`,
`last_activity`, `quiz_passes`.
Rules: read own. Client may create/update only reading states (`unread`/`read`);
conquest states are set by the quiz-finish endpoint (Prompt 07). Decay flips
state via nightly cron.

### sr_cards — unique (user, question)
`ease` (min 1.3), `interval_days`, `reps`, `due_date`, `lapses`, `suspended`.
Rules: create/read own; scheduling updates are server-owned (Prompt 08).

### tests
`title`, `kind` (sectional/mock), `config` (json), `question_ids` (json|null),
`is_free`, `status` (draft/live). Rules: live readable by all; admin sees drafts.

### test_attempts
`user`, `test`, `started_at`, `submitted_at`, `answers` (json qid→index),
`score`, `max_score`, `percentile`, `palette_state` (json).
Rules: create/read own. Update own BUT scoring/identity/time fields are blocked
(`:isset` guards) — the client only persists `answers` + `palette_state`
mid-attempt; submit/scoring is server-side (Prompt 11, timer honesty).

### ca_items
`date`, `headline`, `summary`, `source_name`, `source_url`, `linked_topics`
(json), `status` (draft/approved/rejected/published), `quiz_question_ids` (json).
Rules: published readable by all; admins read/update everything (admin queue).

### battalions
`name`, `week_start`, `member_count`. Auth-only read; server writes.
Auto-created every 50 members (user create hook).

### leaderboard_entries — unique (user, week_start)
`battalion`, `user`, `week_start`, `xp_week`. Auth-only read; written by the
awardXP hook (Prompt 09).

### pet_logs
`event` (sprint_100m/run_800m/long_jump/shot_put), `value` (seconds or metres),
`logged_at`. Full CRUD on own records.

### payments
`razorpay_order_id`, `razorpay_payment_id`, `amount_inr`, `plan`, `status`
(created/paid/failed/refunded), `raw` (json). Read own; **no client writes** —
server hooks only (Prompt 14).

### referral_credits
`user`, `referred_user`, `days_granted`, `granted_at`. Read own; server-granted.

## Hooks (pb_hooks/)

| File | What |
|---|---|
| `users.pb.js` | on user create: defaults (xp 0, cadet, 2 freezes, role user), unique referral_code, battalion assignment (new battalion each 50 members); post-create member_count increment |
| `cron.pb.js` | `topic_decay` 02:30 IST daily — conquered + 21 days idle → decaying. `premium_expiry` 03:00 IST daily — clears `is_premium` once `premium_until` passes (Prompt 14). `leaderboard_rollover` Monday 00:00 IST — stamps new week_start on battalions (entries key on (user, week_start), so weeks accumulate naturally). `freeze_refill` monthly |
| `pay.pb.js` | Razorpay order/verify/webhook/restore (Prompt 14); grants premium idempotently via the payments-row ledger |
| `lib/entitle.js` | shared entitlement + pricing + premium/referral grant module (`require`d by pay/quiz/sr/test/ca) |
| `notify.pb.js` | push preview (self) + test (admin) endpoints (Prompt 15) |
| `lib/notify.js` | OneSignal send + server-side opt-out gate + candidacy (`require`d by cron + notify) |
| `cron.pb.js` (P15) | `briefing_push` 07:00, `streak_risk_push` 20:30, `sr_pileup_push` 18:00, `battalion_weekly_push` Mon 08:00, `pt_reminder_push` Sat 09:00 IST |
| `pt.pb.js` | Drill Ground XP + PT streak + fitness badges on first workout of the IST day (Prompt 16) |

Cron expressions run in the server's local TZ; the VPS is set to Asia/Kolkata
by `infra/setup.sh`.

## Seed (pb/seed/)

`seed.js` upserts `fixtures/topics.json` (POL-05 Preamble, POL-10 Fundamental
Duties, POL-19 Vice-President) and `fixtures/questions.json` (30 MCQs, 10 per
topic, `source_type: ai`, `status: draft`). Idempotent — matches on
`id_code`/`qid`.

## Acceptance-criteria verification (00-B)

| Criterion | How to prove |
|---|---|
| Fresh PB + migrations reproduces schema | delete pb_data, restart, compare collections |
| Anonymous cannot read answer_index / premium notes_md | `curl $PB/api/collections/questions/records` → 403/empty; `curl $PB/api/collections/topics/records` returns only free topics |
| User A cannot read user B's attempts | authed curl with A's token + filter on B → empty list |
| 51st user spills into second battalion | create 51 users via API, check battalions.member_count |
