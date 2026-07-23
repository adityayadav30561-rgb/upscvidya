# CLAUDE CODE BUILD BOOK — Polity MVP PWA
## Complete prompt sequence, in execution order

**How to use this document:**
- Run prompts in order. Each assumes the previous ones are complete.
- Paste one prompt per Claude Code session (or continue in-session if context allows).
- Before Prompt 01, place these files in the repo root under `/docs`: `polity-mvp-master.md`, the approved design outputs from Fable 5 (`tokens.css`, component inventory, screen mockups), and this build book.
- Replace all `[PLACEHOLDERS]` before pasting: `[APP NAME]`, `[DOMAIN]`, `[VPS_IP]`, keys where noted.
- Every prompt ends with acceptance criteria. Do not move on until they pass.

---

## PHASE 0 — INFRASTRUCTURE

### PROMPT 00-A: VPS + PocketBase setup

```
You have SSH access to a fresh Ubuntu 24.04 ARM VPS at [VPS_IP] (Oracle Always Free, 4 OCPU, 24GB RAM). Set up the production backend for [APP NAME], a CAPF exam prep PWA.

Tasks:
1. Harden the server: create non-root sudo user "appadmin", disable root SSH login and password auth (key only), configure ufw (allow 22, 80, 443 only), enable unattended-upgrades, set timezone Asia/Kolkata.
2. Install Caddy as reverse proxy with automatic HTTPS for api.[DOMAIN].
3. Install PocketBase (latest ARM64 release) at /opt/pocketbase:
   - Run as a systemd service under a dedicated "pocketbase" user
   - Data dir /opt/pocketbase/pb_data
   - Bind 127.0.0.1:8090; Caddy proxies api.[DOMAIN] → localhost:8090
4. Backups: nightly cron at 03:00 IST that stops nothing (use PocketBase's online backup API or sqlite .backup), gzips pb_data snapshot to /opt/backups, keeps 14 days, and syncs to Cloudflare R2 via rclone (I will provide R2 credentials; write the rclone config template and document where to insert keys).
5. Install Node.js LTS + pnpm (for future sync/cron scripts) and create /opt/jobs directory for scheduled scripts with a jobs.md README.
6. Write everything as an idempotent setup.sh I can re-run, plus a SERVER.md documenting: service commands, backup restore procedure, Caddy config location, and how to update PocketBase safely.

Acceptance criteria:
- https://api.[DOMAIN]/_/ loads the PocketBase admin UI over valid TLS
- systemctl status pocketbase shows active; survives reboot
- Manual run of the backup script produces a restorable snapshot (demonstrate restore to /tmp)
- ufw active with only 22/80/443
```

### PROMPT 00-B: PocketBase collections schema

```
Using the PocketBase admin API (or a migration JS file in pb_migrations), create the complete schema for [APP NAME]. Reference /docs/polity-mvp-master.md for the content model.

Collections:

1. users (extend built-in): fields — display_name (text), avatar_seed (text), exam (select: capf), target_year (number), daily_minutes (number), xp (number, default 0), rank_code (select: cadet..dg, default cadet), streak_current (number), streak_best (number), streak_freezes (number, default 2), last_active_date (date), battalion_id (relation→battalions), is_premium (bool), premium_until (date), premium_plan (select: monthly, till_exam), referral_code (text, unique), referred_by (relation→users), role (select: user, admin; default user).

2. topics: id_code (text, unique, e.g. POL-08), title, part_no (number), region (select: foundations, system, centre, states, grassroots, institutions, dynamics, courtroom), kind (select: chapter, appendix), book_ref (text), mcq_floor (number), tags (json array), guided_order (number), est_read_minutes (number), prerequisites (json array), notes_md (editor/text: the 500-700 word notes), status (select: draft, live), is_free (bool).

3. questions: qid (text, unique, e.g. POL-08-Q042), topic (relation→topics), stem (text), options (json array of 4), answer_index (number 0-3), explanation (text), tier (number 1-5), format (select: single-factual, statement-based, match-pairs, assertion-reason, chronology, odd-one-out, fill-appropriate), exams (json array), source_type (select: ai, self, external, pyq, ca), source_meta (json), status (select: draft, validated, live, retired), attempts_count (number), correct_count (number).

4. attempts: user (relation), question (relation), topic (relation), context (select: topic_quiz, sectional, mock, pyq, daily_ca, sr_review, drill), chosen_index (number), is_correct (bool), time_taken_ms (number), attempted_at (autodate).

5. topic_progress: user, topic (relations, unique pair), state (select: unread, read, conquered, gold, decaying), best_score_pct (number), last_activity (date), quiz_passes (number).

6. sr_cards: user, question (relations, unique pair), ease (number, default 2.5), interval_days (number, default 0), reps (number, default 0), due_date (date), lapses (number), suspended (bool).

7. tests: title, kind (select: sectional, mock), config (json: regions, tiers, count, duration_sec, negative_mark), question_ids (json array; null for dynamic sectionals), is_free (bool), status (select: draft, live).

8. test_attempts: user, test (relations), started_at, submitted_at, answers (json map qid→index), score (number), max_score (number), percentile (number, nullable), palette_state (json).

9. ca_items: date (date), headline (text), summary (text), source_name (text), source_url (url), linked_topics (json array of topic id_codes), status (select: draft, approved, rejected, published), quiz_question_ids (json array).

10. battalions: name (text), week_start (date), member_count (number).

11. leaderboard_entries: battalion (relation), user (relation), week_start (date), xp_week (number). Unique on (user, week_start).

12. pet_logs: user (relation), event (select: sprint_100m, run_800m, long_jump, shot_put), value (number: seconds or metres), logged_at (date).

13. payments: user (relation), razorpay_order_id, razorpay_payment_id, amount_inr (number), plan (select), status (select: created, paid, failed, refunded), raw (json).

14. referral_credits: user, referred_user (relations), days_granted (number), granted_at.

API rules (critical):
- topics: list/view public for status=live; notes_md hidden via view rule unless (is_free=true OR @request.auth.is_premium=true OR @request.auth.role="admin") — implement with a public "topics_public" view collection or field-level rule strategy; document the chosen approach.
- questions: never listable in bulk by clients. Quiz delivery happens through custom endpoints (Prompt 07) that return only live questions without answer_index; answers verified server-side.
- attempts, sr_cards, topic_progress, test_attempts, pet_logs: create/read own records only (user = @request.auth.id).
- ca_items: public read for status=published only.
- payments: no client create/update; server-only via hooks.
- Admin role bypasses via role="admin" checks.

Also create pb_hooks JS files (PocketBase extend):
- On user create: generate referral_code, assign to current open battalion (create new battalion when member_count reaches 50).
- Nightly cron (PocketBase cron): decay job — topic_progress where state=conquered and last_activity older than 21 days → state=decaying; leaderboard week rollover on Mondays 00:00 IST.

Deliver: migration files committed to repo, a SCHEMA.md documenting every collection/rule, and a seed script that loads 3 sample topics + 30 sample questions from /docs fixtures for development.

Acceptance criteria:
- Fresh PocketBase + migrations reproduces the schema exactly
- Anonymous request cannot read answer_index or premium notes_md (prove with curl)
- User A cannot read user B's attempts (prove with curl)
- Creating 51 users spills into a second battalion automatically
```

---

## PHASE 1 — CONTENT PIPELINE

### PROMPT 01: Content repo + sync script

```
Create the content pipeline for [APP NAME]. Content lives in a Git repo folder /content and syncs to PocketBase.

Structure (from /docs/polity-mvp-master.md):
/content/polity/POL-01-historical-background/
  topic.md      # frontmatter (id_code, title, part_no, region, kind, book_ref, mcq_floor, tags, guided_order, est_read_minutes, prerequisites, is_free) + markdown body = notes
  mcqs.json     # array of question objects per the provenance schema in polity-mvp-master.md
/content/polity/APX-1-articles-drill/   # kind: appendix, topic.md body optional

Build:
1. A validator (pnpm validate): checks every topic.md frontmatter against schema, every mcqs.json against the question schema (all 4 options present, answer_index 0-3, explanation non-empty, tier 1-5, valid format/source_type, qid matches folder id_code, qid unique across repo). Exit non-zero with precise file:line errors.
2. A sync script (pnpm sync -- --env prod|dev): upserts topics and questions to PocketBase via admin API. Rules: match on id_code/qid; update changed fields; NEVER downgrade status (a question set live in PB stays live even if repo says validated); deletions in repo → mark status=retired in PB, never hard delete (attempt history depends on them). Print a change report (created/updated/retired counts).
3. A GitHub Action: on push to main, run validate; if pass, run sync against prod using repo secrets PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD/PB_URL.
4. Generate 3 complete example topics as fixtures (POL-05 Preamble, POL-10 Fundamental Duties, POL-19 Vice-President) with 10 real, correct MCQs each (you may draft these; mark source_type "ai", status "draft") so the app has dev data.

Acceptance criteria:
- Deliberately broken fixture (missing explanation) fails validation with a precise error
- Sync twice in a row: second run reports zero changes (idempotent)
- Editing one MCQ stem and re-syncing updates exactly one record
```

### PROMPT 02: MCQ ingestion tool (external feeds)

```
Build the ingestion CLI that converts raw MCQs I feed (from books, PDFs, test series, my own writing) into schema-valid mcqs.json entries. This runs locally, and its output goes through Git → sync like all content.

Command: pnpm ingest -- --topic POL-08 --source "external:<name>" --file input.txt (also accept --source self, pyq:CAPF-2022, ai)

Pipeline:
1. Parse loosely structured text: numbered questions, options as a)-d)/A-D/1-4, answer lines like "Ans: b", optional explanations. Handle statement-based blocks. Tolerate messy spacing.
2. For each parsed question, call Groq API (llama-3.3-70b, key from env GROQ_API_KEY) to: (a) normalise into the JSON schema, (b) classify tier 1-5 and format, (c) draft an explanation if missing, covering every option, (d) for source_type external from commercial publications: REWRITE stem and options in fresh wording preserving the exact concept tested — never copy expression; for pyq: keep verbatim.
3. Dedup: compare against existing mcqs.json stems for that topic using normalised trigram similarity; flag >0.75 matches into a separate review file dupes.json instead of the main output.
4. Everything outputs with status "draft" — nothing I feed goes live without my validation (that happens in the admin queue or by my editing the JSON).
5. Assign next available qid for the topic automatically.
6. Also support --mode image-list: I give a folder of photos of question pages; use tesseract OCR first, then the same pipeline (accept lower accuracy, everything is draft anyway).

Acceptance criteria:
- A messy 10-question text file ingests into 10 valid schema entries passing pnpm validate
- Feeding the same file twice puts all 10 into dupes.json on the second run
- A commercial-source question demonstrably has rewritten wording; a pyq-source question is untouched
```

---

## PHASE 2 — APP FOUNDATION

### PROMPT 03: SvelteKit PWA scaffold + design system

```
Scaffold the [APP NAME] frontend. Reference design artifacts in /docs/design (tokens.css, component inventory, screen mockups) — implement them faithfully, do not restyle.

Stack: SvelteKit (latest), TypeScript, adapter-static, deployed later to Cloudflare Pages. No UI framework/library; hand-built components from mockups. No Tailwind — plain CSS with the design tokens.

Tasks:
1. Project setup: /app folder in the monorepo, strict TS, ESLint+Prettier, vitest for units, Playwright for e2e.
2. Import /docs/design/tokens.css as the global stylesheet; wire dark (default) + light themes via data-theme attribute with a persisted toggle.
3. Build the shared component library in src/lib/components exactly per the inventory: Button (variants), Card, Chip, ProgressRing, StreakFlame, RankInsignia (10 ranks, inline SVG from the design), MapNode (all 5 states), OptionRow (idle/selected/correct/incorrect/missed), BottomNav (Home, Map, Tests, Briefing, Profile), Sheet, Modal, Toast, Skeleton loaders. Each with a small vitest and a /dev/kitchen-sink route rendering all states.
4. PWA: manifest (name [APP NAME], theme colors from tokens, icons — generate placeholder icon set from a simple geometric mark), service worker via vite-plugin-pwa: precache app shell, runtime cache strategy stubs (filled in Prompt 06), custom install prompt component shown after 2nd visit, iOS/Android install instructions sheet.
5. PocketBase client: src/lib/pb.ts singleton pointing at PUBLIC_PB_URL env, typed collection helpers generated from SCHEMA.md (write the types by hand or via pocketbase-typegen).
6. App shell: authenticated layout with BottomNav, unauthenticated layout, route guards.

Acceptance criteria:
- pnpm build produces a static build with zero errors; Lighthouse PWA installable check passes on preview
- /dev/kitchen-sink shows every component state matching the mockups side-by-side
- Theme toggle persists across reload
```

### PROMPT 04: Authentication + onboarding

```
Implement auth and onboarding per the design mockups (screens: onboarding 3-step).

1. Auth methods via PocketBase: Google OAuth2 and email/password (with email verification flow). Auth pages: sign in, sign up, forgot password, verify notice. Handle OAuth redirect flow for a static-hosted SPA correctly.
2. Session: PocketBase authStore persisted; silent refresh; global user store in Svelte with derived isPremium, rankCode, xp.
3. Onboarding (first login only): Step 1 exam selection (CAPF AC active; CSE/AFCAT cards visible but disabled "coming soon"), Step 2 target attempt year (2027/2028), Step 3 daily study minutes (30/60/90/120) → writes to user record; compute and store nothing else yet.
4. Referral handling: /r/[code] links land on signup with the code pre-applied; on successful signup store referred_by. (Credit granting comes in Prompt 14.)
5. Guard logic: unauthenticated → marketing/auth routes only; authenticated without onboarding → onboarding; else app.

Acceptance criteria:
- Full e2e Playwright test: email signup → verify (use PB test hook) → onboarding → lands on dashboard
- Google OAuth flow works on the deployed preview URL
- Visiting /r/TESTCODE then signing up stores referred_by correctly
```

---

## PHASE 3 — CORE LEARNING LOOP

### PROMPT 05: Territory map

```
Build the Polity territory map screen per the mockup (screen 3).

1. Data: fetch all live topics + the user's topic_progress in one load; group by the 8 regions (foundations → courtroom) per /docs/polity-mvp-master.md, ordered by guided_order.
2. Render the campaign map: regions as sections along a scrollable path, topic nodes with the 5 visual states (free-roam readable, unconquered, conquered, decaying, gold). The guided path highlights the next recommended node (first unconquered in guided_order whose prerequisites are conquered — but never blocks tapping others; free roam is absolute for reading).
3. Region headers show completion % and a small conquered/total count. Appendix drill nodes (APX-*) render with a distinct drill styling and unlock per the region mapping in the master doc.
4. Node tap → bottom sheet: title, est read time, best score, MCQ count, actions "Read notes" / "Attempt quiz" (quiz disabled with lock hint if premium-gated and user is free — gating rules from is_free).
5. Conquest animation: when a topic transitions to conquered (event from quiz results), animate the node fill + a subtle region progress tick per the interaction notes.
6. Performance: map must render smoothly with 103 nodes on a low-end Android (test with CPU 6x throttle); virtualise or simplify SVG as needed.

Acceptance criteria:
- All 103 units render grouped correctly with accurate states from seeded progress data
- Guided-path recommendation updates correctly after conquering the current node
- 6x CPU throttle scroll stays above ~50fps in the profiler
```

### PROMPT 06: Topic reader + offline notes

```
Build the topic reader (screen 4) and the offline layer.

1. Reader: render notes_md (markdown → sanitised HTML) with the reading typography from tokens; adjustable text size (persisted); scroll progress bar; book_ref shown subtly; sticky bottom CTA "Attempt Quiz (N questions)".
2. Reading marks topic_progress state unread→read at 80% scroll depth (debounced, once).
3. Offline: service worker runtime caching — when a user opens a topic, cache its notes payload; a "saved for offline" indicator per topic; a profile setting "Download all my unlocked notes" that prefetches every notes payload the user is entitled to (respect premium gating server-side: the cached payloads come from the entitled API). Quizzes and everything write-based remain online-only with a clean offline error state ("Quiz needs a connection. Notes are available offline.").
4. Premium gating UX: free user opening a gated topic sees the first ~120 words then a fade-out into the paywall card (content is server-trimmed for free users — never ship full text and hide with CSS).

Acceptance criteria:
- Airplane mode: previously-read topic opens fully; unread gated topic shows offline state; quiz CTA shows the network-required message
- Free user's network response for a gated topic contains only the teaser text (verify in devtools)
- Text size preference survives reload
```

### PROMPT 07: Quiz engine (server endpoints + player + results)

```
Build the topic quiz system: PocketBase custom endpoints + the quiz player (screen 5) and results/review (screen 6).

Server (pb_hooks custom routes):
- POST /api/quiz/start {topic_id}: validates entitlement (free topic or premium), composes a quiz: 12 questions from the topic's live pool — weighted 30% tier 1-2, 40% tier 3, 30% tier 4+, prefer least-attempted-by-this-user, mix formats. Creates a server-side quiz session (store composed qids + shuffled option orders), returns questions WITHOUT answer_index (options pre-shuffled server-side, mapping kept server-side).
- POST /api/quiz/answer {session_id, qid, chosen_display_index, time_ms}: verifies against server mapping, records an attempts row, updates question attempts/correct counts, returns correct display index + explanation.
- POST /api/quiz/finish {session_id}: computes score; if ≥70%, upsert topic_progress to conquered (or gold if ≥90% on a second+ pass with all tiers represented); if <70% stays read; enqueue every wrong answer into sr_cards (Prompt 08 owns scheduling; here just create card with due today); award XP (Prompt 09 rules; call the XP hook); returns summary payload.

Client:
- Quiz player exactly per mockup: one question per view, statement-based layout support, immediate feedback mode for topic quizzes (answer → reveal correct + explanation inline → next), flag-for-review, progress dots, resume-safe (session persists across refresh via session_id in URL state).
- Results screen: score, conquer state celebration or retry encouragement, tier-wise breakdown bars, full per-question review list, "N wrong answers added to your Revision Stack" confirmation, CTAs (retry / next guided topic / back to map).
- Drill mode for APX nodes: same engine, 15 rapid questions, timer per question (20s), no notes prerequisite.

Acceptance criteria:
- answer_index never appears in any network response before the user answers (verify via devtools capture)
- Refreshing mid-quiz resumes at the same question with prior answers intact
- Scoring 9/12 flips the map node to conquered and creates exactly 3 sr_cards
- Two users get different question compositions for the same topic (attempt-count weighting works)
```

### PROMPT 08: Spaced repetition engine

```
Implement the SM-2 based Revision Stack (screen 7).

1. Scheduling (server hook on review answer): SM-2 with quality mapped from performance — again(0-2)/good(4)/easy(5) buttons after each review question. Wrong review → lapse: reps=0, interval=1d, ease=max(1.3, ease-0.2). Correct: standard SM-2 interval/ease progression. Cap interval at 60 days pre-exam context.
2. Review endpoint set mirroring the quiz endpoints: /api/sr/due (count + batch of due cards' questions, no answers), /api/sr/answer (verify, reschedule, return explanation + next due preview).
3. Client Revision Stack: due count hero, swipe-through card UI per mockup, again/good/easy controls post-reveal, session summary. Empty state when nothing due ("All clear, Commandant" style microcopy per design).
4. Decay integration: topics in decaying state surface a "Restore territory" 5-question micro-quiz (compose from that topic's most-missed questions); passing restores conquered and refreshes last_activity.
5. Dashboard integration point: expose a store/endpoint for today's due count (Prompt 09 consumes it).
6. Daily cap and ordering: max 60 reviews/day, overdue first, then by ease ascending.

Acceptance criteria:
- Unit tests for the SM-2 math: documented table of (state, quality) → (new interval, ease) passes
- A card answered "again" reappears in the same session's tail; "easy" schedules ≥4 days out on rep 2
- Restoring a decayed topic flips map state and clears the decay warning
```

---

## PHASE 4 — GAMIFICATION

### PROMPT 09: XP, ranks, streaks, dashboard

```
Implement the progression system and the Home dashboard (screen 2).

XP rules (server-side only, single awardXP hook; client never writes XP):
- Correct topic-quiz answer: 10 × tier multiplier (T1-2: 1.0, T3: 1.4, T4: 1.8, T5: 2.2)
- Correct SR review: 8 flat (12 if the card had ≥1 lapse)
- Topic conquered: 100 bonus; gold: 150; region complete: 500
- Drill session complete: 40; mock submitted: 200 + score-scaled bonus
- Daily CA quiz complete: 30
- Anti-farm: repeat correct answers on the same question within 7 days award 0 (except SR-scheduled reviews)

Ranks: thresholds Cadet 0, Constable 500, Head Constable 1500, ASI 3500, SI 7000, Inspector 12000, AC 20000, DC 32000, Commandant 50000, DG 75000. Rank-up event → full-screen celebration per design with new insignia.

Streaks: a day counts if the user completes ≥1 of (topic quiz, 10+ SR reviews, daily CA quiz). Computed server-side on activity against Asia/Kolkata days. 2 streak freezes/month auto-apply on a missed day (toast informs user next visit). Streak milestones (7/30/100) award badges.

Dashboard assembly per mockup: greeting + rank insignia, streak flame with freeze count, Today's Mission card (next guided topic + SR due count + daily CA state, each tappable), syllabus completion ring (conquered/103), weekly XP sparkline, quick actions row.

Also: badges collection (schema addition if needed) with an initial set — first conquest, region badges ×8, streak 7/30/100, PET Ready, mock finisher, beta founder.

Acceptance criteria:
- XP unit tests cover every rule incl. anti-farm and multipliers
- Simulated 3-day activity pattern with 1 gap consumes exactly 1 freeze and preserves the streak
- Rank-up fires exactly once crossing a threshold; dashboard reflects all live data with skeleton loading states
```

### PROMPT 10: Battalion leaderboards

```
Implement weekly battalion leaderboards (screen 13).

1. Server: leaderboard_entries maintained by the awardXP hook (increment xp_week for current week). Monday 00:00 IST cron: snapshot final standings (store top-3 as badge awards: weekly podium badges), reset entries for the new week.
2. Client: battalion board per mockup — user's row emphasised and sticky if scrolled out of view, rank insignia beside names, week countdown timer, top-3 styling, pull-to-refresh with 60s cache.
3. Privacy: display_name + insignia only; no emails; a settings toggle "appear as Anonymous Cadet" replaces the name on boards.
4. Empty/new-battalion states per design.

Acceptance criteria:
- Two users in the same battalion see the same board; XP award reflects within one refresh
- Anonymous toggle immediately masks the name for other viewers
- Week rollover (simulate by clock) resets xp_week and preserves history
```

---

## PHASE 5 — ASSESSMENT SUITE

### PROMPT 11: Test centre, sectionals, mock player

```
Build the Test Centre (screen 8) and Mock Player (screen 9).

1. Sectional generator: client configures (regions multi-select, tier range, 20 or 50 questions) → server endpoint composes from live pool with the standard tier weighting, creates a test_attempt, timed (45s/question budget total), NO immediate feedback — exam conditions; review after submit.
2. Mocks: admin-authored tests records (kind: mock) with fixed question_ids, 125 questions, 120 minutes, CAPF marking (correct +2, wrong −2/3 of 2 marks... implement as config: {correct: 2, negative: 0.667}); one free mock (is_free), rest premium.
3. Mock player per mockup: dense mode, question palette grid (unanswered/answered/marked/current), section timer with 10-min and 2-min warnings, auto-submit at zero, mark-for-review, palette jump, submit confirmation listing unanswered count. Session resume-safe: palette_state + answers persisted to test_attempts continuously (debounced); disconnect/reload resumes with timer honesty (server start time is truth).
4. Results: score with negative-marking breakdown, percentile against all attempts of that test (server-computed, updates as more attempt), region-wise and tier-wise accuracy, full review with explanations, weakest-region CTA into a targeted sectional.
5. Attempt history list with trend line.

Acceptance criteria:
- Timer tampering (client clock change) doesn't extend a mock (server start_time enforced on submit)
- Negative marking math verified in unit tests incl. rounding
- Resume mid-mock restores palette, answers, and correct remaining time
- Percentile recomputes correctly when a second seeded attempt scores differently
```

### PROMPT 12: PYQ vault

```
Build the PYQ Vault (screen 10) — fully free, the acquisition hook.

1. Content: PYQs live as questions with source_type=pyq (source_meta: {exam:"CAPF", year, qno}). Add a repo folder /content/pyq/CAPF-2022/mcqs.json etc. handled by the same validator/sync.
2. Vault UI: browse by year (2018-2025 cards with counts) and by topic (topic list with PYQ counts); free badge prominent per design.
3. Attempt modes: inline single-question practice (immediate feedback) and "Attempt full paper as test" (routes into the test engine with that year's questions, standard mock rules, free).
4. Every PYQ question screen shows its topic chip linking to the topic (reading may be gated; the question never is).
5. SEO groundwork: even as a PWA, prerender public marketing routes /pyq/capf-[year] with question counts and topic breakdown summaries (not the full questions) for organic search landing; CTA to install/sign up.

Acceptance criteria:
- Anonymous (logged-out) users can browse and attempt PYQs inline; attempting prompts a soft signup nudge after 5 questions but never hard-blocks the current question's answer
- Year paper as full test works through the standard engine for a free user
- Prerendered /pyq/capf-2022 route serves static HTML with correct counts
```

---

## PHASE 6 — DAILY ENGINE

### PROMPT 13: Current affairs pipeline + Daily Briefing + admin queue

```
Build the CA pipeline (server), the Daily Briefing screen (11), and the Admin Validation Queue (16).

Pipeline (Node script in /opt/jobs, cron 05:30 and 17:30 IST):
1. Fetch PIB RSS (all ministries feed) + an admin-managed list of extra RSS/URLs (stored in a pb collection "sources" I can edit).
2. Filter + dedup (URL + title similarity against last 14 days).
3. For each candidate, Groq call: (a) CAPF-relevance classification with confidence, discard low; (b) 60-90 word summary in original wording; (c) tag 1-3 linked_topics from the POL taxonomy (provide the topic list in the prompt context); (d) draft 2-3 MCQs (schema-valid, source_type ca, status draft).
4. Insert ca_items status=draft with their draft questions. Send me a push/telegram ping "N items awaiting review".
5. Log every run to a jobs_log collection; failures alert.

Admin Queue (route /admin, role-gated, mobile-first utilitarian per mockup):
- Card stack of draft ca_items: summary editable inline, topic chips editable, per-question accordion with edit controls, actions Approve / Reject / Approve item without quiz. Dupe warnings shown. Batch approve.
- Approved items get status=published with publish_date = today (or scheduled 07:00 next morning if approved after 20:00). Approved CA questions flip to live and join their linked topics' pools (provenance ca).
- Also in admin: draft question review (from ingestion/AI), source list management, and a "compose mock" tool (filter pool → pick 125 → save as mock test).

Daily Briefing client per mockup: date-strip calendar, feed of published items (headline, summary, source chip, topic chips), expandable mini-quiz per item (immediate feedback, XP per Prompt 09), monthly archive browse. Free tier: today + yesterday; premium: full archive. 07:00 push notification "Daily Briefing is ready" (wire in Prompt 15).

Acceptance criteria:
- Dry-run of the pipeline against live PIB RSS produces schema-valid drafts with sensible topic tags (show me a sample of 5)
- Approving an item in the queue publishes it and its questions atomically
- Free user hits the archive paywall on day-before-yesterday; premium doesn't
```

---

## PHASE 7 — MONETIZATION & GROWTH

### PROMPT 14: Payments, paywall, referrals

```
Implement Razorpay payments, the paywall (screen 15), premium gating audit, and referrals.

1. Razorpay (standard checkout, not subscriptions — both plans are one-time): server endpoints create order (₹199 monthly = 30 days, ₹999 till-exam = premium_until Aug 31 2027), verify payment signature webhook + client callback double-verification, then set is_premium/premium_until/premium_plan. Store everything in payments. Handle: reused orders, replayed webhooks (idempotency), failure states, and a pending-verification UI state.
2. Beta discount: users with a beta_founder badge see 50% prices (₹99/₹499) — priced server-side, never client-computed.
3. Paywall screen per mockup: plan comparison, till-exam anchored as default, trust elements, restore-purchase flow (re-check by logged-in identity).
4. Gating audit: sweep every premium surface and centralise checks into one entitlement helper used by server endpoints (topics teaser trim, quiz start, sectionals beyond monthly free one, mock list, SR engine beyond wrong-answer replay of free topics, CA archive). Write an ENTITLEMENTS.md matrix: feature × free/premium.
5. Expiry: nightly cron clears lapsed premium; in-app expiry warnings at 7/1 days for monthly.
6. Referrals: referral_code share sheet on profile ("Recruit a batchmate"); when a referred user completes their first topic quiz (not just signup — quality gate), grant BOTH users +7 premium days (extend premium_until or bank as start-later credit for free users). Cap 10 credits/user. Admin view of referral stats.

Acceptance criteria:
- Test-mode Razorpay end-to-end for both plans flips entitlements correctly; replayed webhook does not double-extend
- Every row of ENTITLEMENTS.md has a passing Playwright test for free vs premium behaviour
- Referral credit grants exactly once, on first quiz completion, to both parties
```

### PROMPT 15: Push notifications + analytics

```
Wire OneSignal push and PostHog analytics.

1. OneSignal web push: SDK integrated with the service worker (coexisting with vite-plugin-pwa correctly — document the SW composition approach), permission prompt shown only after the user completes their first topic quiz (never on first load), tags set per user (rank, streak_current, is_premium, last_active bucket).
2. Notification sends (server-triggered via OneSignal API from cron/hooks): 07:00 Daily Briefing ready; streak-at-risk 20:30 if no qualifying activity that day (and a freeze won't auto-cover... actually send regardless with appropriate copy); SR pile-up (≥25 due) max once per 3 days; weekly battalion result Monday morning. Every send type has an opt-out toggle in settings, honoured server-side.
3. PostHog (free cloud tier): capture the funnel — signup_completed, onboarding_completed, first_topic_read, first_quiz_completed, topic_conquered, sr_session_completed, mock_started/submitted, paywall_viewed, checkout_started, payment_success, ca_quiz_completed, referral_shared. Identify by PB user id; set person properties (rank, premium, target_year). Respect a "minimal analytics" settings toggle. No PII in event payloads beyond the id.
4. Dashboards: document (POSTHOG.md) the 4 saved insights to create manually: activation funnel, D1/D7/D30 retention by cohort, free→paid conversion, feature usage breakdown.

Acceptance criteria:
- Push permission prompt appears only post-first-quiz; each notification type can be disabled and is then not sent (verify with a forced trigger)
- All listed events appear in PostHog with correct properties in a full e2e pass
- Two service workers do not conflict (offline caching and push both verified working together)
```

---

## PHASE 8 — PET, POLISH, LAUNCH

### PROMPT 16: PET tracker

```
Build the PET tracker (screen 12).

1. Log entry sheet per event: 100m sprint (seconds), 800m run (min:sec input, stored seconds), long jump (metres), shot put (metres, 7.26kg noted). Date defaults today, backdating allowed 30 days.
2. Standards: store official CAPF PET qualifying standards as constants with male/female variants (user picks category in settings; changeable): male — 100m in 16s, 800m in 3:45, long jump 3.5m (3 chances), shot put 4.5m; female — 100m in 18s, 800m in 4:45, long jump 3.0m. Show a clear disclaimer line: "Verify current standards in the official UPSC CAPF notification."
3. Trend charts per event (lightweight inline SVG chart, no chart library): attempts over time vs the standard line, best-attempt marker, pass zone shading.
4. "PET Ready" state: latest attempt in every applicable event meets standard → badge award + dashboard chip.
5. Reminder option: weekly PET log nudge (opt-in, via Prompt 15 infra).

Acceptance criteria:
- min:sec input parses and stores correctly incl. edge cases (3:45, 03:45, 225)
- Charts render correct pass/fail zones for both category standards
- PET Ready badge grants and revokes correctly as logs change category context
```

### PROMPT 17: Deployment, hardening, QA sweep

```
Production deployment and full QA.

1. Cloudflare Pages: connect repo, build config for the SvelteKit static app, custom domain [DOMAIN] + www redirect, environment variables documented in DEPLOY.md. Preview deployments on PRs.
2. API hardening on the VPS: Caddy rate limits (auth endpoints 10/min/IP, quiz answer 60/min/user, ingestion admin-only), CORS locked to [DOMAIN] + preview pattern, request size limits, PocketBase admin UI IP-allowlisted to my IP (documented how to change), health endpoint + uptime monitoring via a free service (document setup for UptimeRobot or similar).
3. Full Playwright e2e suite run against preview covering: the golden path (signup → onboard → read → quiz → conquer → SR next day (clock mock) → mock → results), payment test-mode path, referral path, offline scenarios, free/premium matrix from ENTITLEMENTS.md.
4. Performance pass: Lighthouse mobile ≥90 performance on dashboard, map, reader; bundle analysis with a size budget (document); image/icon optimisation.
5. Data safety drill: perform an actual restore of last night's backup to a scratch PocketBase and verify a seeded user's attempts survive. Document RTO steps in SERVER.md.
6. Security sweep: verify every finding from earlier acceptance criteria still holds (answers never leak, cross-user reads blocked, premium server-enforced, webhook idempotent); run a dependency audit; document residual risks.

Acceptance criteria:
- Green e2e suite on the production preview
- Lighthouse scores recorded and ≥ targets
- Restore drill completed with evidence in SERVER.md
- A written LAUNCH-README.md: every service, key, cron, and how to operate the whole system on one page
```

### PROMPT 18: Beta cohort + launch instrumentation

```
Final pre-launch tasks.

1. Beta founder system: an invite-code gate (admin-generated codes collection) that grants the beta_founder badge on signup; capacity counter; codes shareable as links /beta/[code].
2. Feedback loop: an in-app feedback sheet (screenshot-optional, category select) writing to a pb collection + notifying me; a visible "Beta" ribbon component toggled by config.
3. Kill-switches & config: a remote config collection (feature flags: duels_enabled etc. for future, maintenance_banner text, min_app_version) read at app boot.
4. Seed production: run the full content sync for all authored Polity topics; run the mock composer for the first free mock; verify counts against polity-mvp-master.md totals and report a content coverage table (topics live vs floor met per region).
5. Launch checklist doc: DNS, OneSignal prod keys, Razorpay live keys + webhook URL swap, PostHog prod project, backup verification date, admin IP allowlist, support email/telegram link in app footer, and the go/no-go criteria (all e2e green, content ≥ Foundations+System+Centre regions fully live, one free mock live, CA pipeline running 7 consecutive days).

Acceptance criteria:
- Beta code flow grants the badge and discount pricing end-to-end
- Config flag flip reflects in-app without redeploy
- Content coverage report generated and accurate
```

> **🔒 LOCKED DECISION (from the Prompt-14 brainstorm, 2026-07) — build this in Prompt 18.**
>
> **Beta is COMPLETELY FREE and OPEN** (anyone who signs up, no capacity gate —
> maximise testers). Implement it as the **★ global-date method**, NOT per-user
> premium writes and NOT a shared login:
>
> 1. **`app_config` collection** (the remote-config from item 3) holds a
>    `beta_free_until` datetime. One admin-editable value controls the whole beta;
>    extend/end beta by changing this one field — no user migration, no redeploy.
> 2. **`pb_hooks/lib/entitle.js`** — add the beta clause to the single chokepoint:
>    `entitled(user) = free || isPremium(user) || isAdmin(user) || now < beta_free_until`.
>    Read `beta_free_until` from `app_config` (cache per request). This makes
>    *everyone* premium during the window and **self-expires** the instant the
>    date passes — no cron, no mass revoke, no stale `is_premium`.
> 3. **Grant `beta_founder` badge on signup** while `now < beta_free_until`
>    (users.pb.js create hook). Prompt 14 already prices `beta_founder` at the
>    forever-50% rate (₹99/₹499), so the free ride *converts into* the founder
>    discount when beta ends. (The invite-code `/beta/[code]` path in item 1
>    still ships for post-beta controlled cohorts / referrals, but is NOT the
>    beta-free mechanism — open signup is.)
> 4. **Countdown banner** (client): a public read of `beta_free_until` drives a
>    ticking "Beta — everything unlocked · ends in Xd Yh" banner; after it passes
>    the same slot flips to "Beta ended → Go Premium" into the Prompt-14 paywall.
>    Mirror `beta_free_until` client-side (boot fetch or `PUBLIC_BETA_FREE_UNTIL`).
> 5. **Paid-during-beta is additive:** a real purchase sets `is_premium`
>    independently, so it survives beta end untouched. Verify: a user with neither
>    purchase nor badge loses access exactly when the date passes; a beta-signup
>    user then sees ₹99/₹499 pricing.
>
> Acceptance additions: toggling `beta_free_until` to a past date drops a
> non-paying user to the free tier live (no cron, no redeploy); a beta-signup
> user holds `beta_founder` and is charged the 50% price afterward.

---

## APPENDIX A — Prompt for composing the first mock (run in admin context or as a script task)

```
Using the live question pool, compose "CAPF Mock 01 (Free)": 125 questions matching the real CAPF Paper 1 Polity-weighted distribution for our Polity-only phase — since only Polity is live, structure it as: 100 Polity across all 8 regions proportional to region size, tier mix 25% T1-2 / 45% T3 / 30% T4+, all formats represented with ≥30 statement-based; plus 25 questions drawn from appendix drill pools (articles, amendments, lists). No question that >40% of active users have already attempted. Save as tests record kind=mock, is_free=true, duration 7200s, marking {correct:2, negative:0.667}. Output the composition report (region × tier matrix).
```

## APPENDIX B — Ongoing weekly ops prompts (post-launch, run as needed)

```
1. "Generate the weekly content health report: per region — live topics vs total, questions vs floor, question status counts, top 10 questions by worst discrimination (high attempts, near-random correct rate) recommended for retirement, SR queue health (avg due backlog per active user)."

2. "Compose Mock [N] with the standard distribution, excluding all questions used in prior mocks."

3. "Run the monthly CA compilation: gather all published ca_items for [month], group by linked topic region, render the branded PDF via the template, upload to R2, attach to the premium downloads list."

4. "Audit new draft questions from ingestion batch [date]: list any failing dedup, missing tier spread per topic vs floor targets, and topics now exceeding floor that need no more authoring priority."
```

---

## COVERAGE CHECK — nothing missed

Cross-reference against every locked decision:

| Decision | Covered in |
|---|---|
| Oracle VPS + PocketBase, ₹0 infra | 00-A, 00-B |
| Git markdown content + sync | 01 |
| External MCQ feeding, provenance, dedup, rewrite rule | 02 |
| SvelteKit PWA, Cloudflare Pages, design fidelity | 03, 17 |
| Google + email auth, onboarding | 04 |
| Territory map, free roam + guided path, decay | 05, 08 |
| Notes offline only, quizzes online | 06 |
| Mandatory topic quiz gate (70% conquer) | 07 |
| SM-2 spaced repetition | 08 |
| XP/ranks/streaks/freezes/badges, CAPF theming | 09 |
| Battalion weekly leaderboards | 10 |
| Sectionals + 125Q/2hr mocks, negative marking, percentile | 11, App A |
| Free PYQ vault + SEO landing | 12 |
| PIB + own sources CA pipeline, Groq drafting, admin queue, 07:00 ritual option | 13 |
| ₹199/₹999 Razorpay, first-30%-free gating, beta 50% | 14 |
| Referrals (invite = free days) | 14 |
| OneSignal push, PostHog funnels | 15 |
| PET log tracker + standards + badge | 16 |
| Deployment, security, backups, QA | 17 |
| Beta cohort, feature flags, launch checklist | 18 |
| Mock composition + ongoing ops | Appendices |
