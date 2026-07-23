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
`POST /api/quiz/start` composes 12 (topic) / 15 (drill) questions weighted
30/40/30 across tiers, preferring least-attempted-by-this-user; reuses an
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
| `cron.pb.js` | `topic_decay` 02:30 IST daily — conquered + 21 days idle → decaying. `leaderboard_rollover` Monday 00:00 IST — stamps new week_start on battalions (entries key on (user, week_start), so weeks accumulate naturally) |

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
