# Project Index — thing → path

> Flat lookup so an agent jumps straight to a file instead of Glob/Grep-ing.
> Update only when files move or are added. Paths relative to repo root.

## Docs (read these, not the repo)

| Thing | Path |
|---|---|
| Session recovery + lifecycle | `CLAUDE.md` §0 |
| Session memory (what's next) | `docs/CURRENT_STATE.md` |
| Build plan (18 prompts) | `docs/claude-code-build-book.md` |
| Content model + MCQ schema | `docs/polity-mvp-master.md` |
| topic.md authoring template (fixed shape) | `docs/CONTENT_AUTHORING.md` |
| Beta readiness checklist (hosting, OAuth, keys) | `docs/BETA_SETUP.md` |
| Screen → prompt map | `docs/screen-map.md` |
| Every API endpoint/cron/CLI | `docs/API.md` |
| DB schema (collections, rules) | `pb/SCHEMA.md` |
| Free vs premium matrix | `ENTITLEMENTS.md` |
| Design tokens / material CSS | `src/lib/styles/tokens.css`, `src/lib/styles/dossier.css` |
| FIELD DOSSIER visual spec | `Army game app redesign directions/Force Prep - Gamified Directions.dc.html` |
| Browser-verify MCP server (Chrome DevTools) | `.mcp.json` |

## Routes (SvelteKit `src/routes/`)

| Screen | Path |
|---|---|
| Base / dashboard | `(app)/+page.svelte` |
| Territory map | `(app)/map/+page.svelte` |
| Topic reader (3a) — **horizontal page-turn**, no vertical scroll | `(app)/topic/[code]/+page.svelte`, `+page.ts` |
| Quiz player (3b) | `(app)/quiz/[code]/+page.svelte` |
| Revision stack (SR) | `(app)/revision/+page.svelte` |
| Test centre — mock cards + drill composer (3c) + empty record (3d) | `(app)/tests/+page.svelte` |
| Mock player | `(app)/tests/[attempt]/+page.svelte` |
| Battalion board | `(app)/battalion/+page.svelte` |
| Drill Ground (fitness) | `(app)/pt/+page.svelte`, `(app)/pt/[routine]/+page.svelte` |
| Daily / monthly briefing (3e) | `(app)/briefing/+page.svelte`, `(app)/briefing/monthly/+page.svelte` |
| Paywall / checkout | `(app)/paywall/+page.svelte`, `(app)/checkout/+page.svelte` |
| Profile hub | `(app)/profile/+page.svelte` |
| Rank ladder (3f) | `(app)/profile/ranks/+page.svelte` |
| Decorations/badges (3g) | `(app)/profile/decorations/+page.svelte` |
| Billing / settings | `(app)/profile/billing/+page.svelte`, `(app)/profile/settings/+page.svelte` |
| Admin queue + AI composer | `admin/+page.svelte` (own route group, not `(app)`) |
| Auth / first-run | `login/`, `forgot/`, `onboarding/`, `path/` |
| Referral landing | `r/[code]/+page.svelte` |
| PYQ vault (public) | `pyq/+page.svelte`, `pyq/[slug]/+page.svelte` |
| Component showcase | `dev/kitchen-sink/+page.svelte` |

## Components (`src/lib/components/`)

| Thing | File |
|---|---|
| RankUp ceremony (4c) | `RankUp.svelte` |
| Territory captured (4d) | `TerritoryCaptured.svelte` |
| Scrollable sector map | `RegionMap.svelte` |
| Answer key row | `OptionRow.svelte` |
| Bottom nav | `BottomNav.svelte` |
| In-chapter retrieval prompt | `RecallBlock.svelte` |
| Badge emblems (25) | `BadgeIcon.svelte` |
| Rank insignia | `RankInsignia.svelte` |
| Modal / Sheet / Toast | `Modal.svelte`, `Sheet.svelte`, `Toast.svelte` |
| Ustad tour overlay | `TourGuide.svelte`, `UstadAvatar.svelte` |
| Primitives | `Button.svelte`, `Card.svelte`, `Chip.svelte`, `ProgressRing.svelte`, `StreakFlame.svelte` |

## Client libs (`src/lib/`)

| Thing | File |
|---|---|
| Typed PB singleton | `pb.ts` |
| Collection types | `types.ts` |
| XP / rank math (mirror of server) | `xp.ts`, `ranks.ts` |
| Markdown + callouts + `:::` retrieval blocks | `markdown.ts` |
| Rune stores | `auth.svelte.ts`, `theme.svelte.ts`, `toast.svelte.ts`, `reader.svelte.ts` |
| Recall marks / weak facts (device-local) | `reader.svelte.ts` |
| Parser + store tests | `src/lib/__tests__/markdown-blocks.test.ts`, `recall-store.test.ts` |
| Domain helpers | `map.ts`, `quiz.ts`, `sr.ts`, `test.ts`, `board.ts`, `ca.ts`, `pyq.ts`, `plan.ts` |
| Money / push / analytics / haptics | `pay.ts`, `push.ts`, `analytics.ts`, `native.ts` |
| Tour + fitness | `tour.svelte.ts`, `workout.svelte.ts`, `pt.ts` |

## Server (PocketBase `pb/`)

| Thing | File |
|---|---|
| Quiz endpoints | `pb_hooks/quiz.pb.js` |
| SR endpoints | `pb_hooks/sr.pb.js` |
| Test/sectional engine | `pb_hooks/test.pb.js` |
| Leaderboard | `pb_hooks/board.pb.js` |
| CA pipeline | `pb_hooks/ca.pb.js`, `pb_hooks/ca_extra.pb.js` |
| Payments | `pb_hooks/pay.pb.js` |
| Push | `pb_hooks/notify.pb.js` |
| Fitness | `pb_hooks/pt.pb.js` |
| Users / referral / cron | `pb_hooks/users.pb.js`, `referral.pb.js`, `cron.pb.js` |
| Shared modules (require at call time) | `pb_hooks/lib/xp.js`, `lib/entitle.js`, `lib/notify.js` |
| Schema migrations | `pb_migrations/*.js` |
| `live_questions` count on the public views | `pb_migrations/1754100000_topic_question_count.js`, `1754200000_teaser_question_count.js` |

## Content + scripts

| Thing | Path |
|---|---|
| Source content (synced to PB) | `content/polity/`, `content/pyq/` |
| Authored chapters | `POL-01` (50 MCQs), `POL-02` (70), `POL-03` (45), `POL-04` (70), `POL-05` (50), `POL-06` (100), `POL-10` (13), `POL-19` (14) |
| Chapter authoring rule (Opus 5, not the AI chain) | `DECISIONS.md` → "Who authors chapters" |
| Validate / sync / snapshot | `scripts/content/validate.js`, `sync.js`, `pyq-snapshot.js` |
| One-off PYQ status repair | `scripts/content/repair-pyq-status.js` (`pnpm repair:pyq`) |
| MCQ ingestion (OCR + AI) | `scripts/ingest/ingest.js`, `parse.js`, `ai.js` |
| AI failover chain (OpenRouter → Gemini → Mistral → OpenCode → Groq; `AI_PROVIDER` pins one) | `scripts/ingest/ai.js`, `infra/jobs/ca-pipeline/index.js`, `pb/pb_hooks/ca_extra.pb.js` |
| VPS infra | `infra/setup.sh`, `Caddyfile`, `infra/backup/`, `infra/jobs/ca-pipeline/` |
| Server ops + **Oracle account posture** (read before provisioning) | `infra/SERVER.md` |
| What beta/launch cost (₹0 / domain only) | `docs/BETA_SETUP.md` → "What this costs" |
