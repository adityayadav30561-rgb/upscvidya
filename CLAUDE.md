# CLAUDE.md — UPSCVidya

> Operating manual for any coding agent working this repo. Read top to bottom
> before touching code. This file is the anti-context-loss guarantee: if a
> session or account switches, everything needed to continue at full quality is
> here or pointed to from here. Keep it current — update the **Build Status**
> table and any changed convention the moment it changes.

---

## 1. What this is

**UPSCVidya** — a mobile-first PWA that prepares candidates for the **UPSC CAPF
Assistant Commandant** exam. The MVP ships a single subject end to end —
**Indian Polity** (103 units: 94 chapter topics `POL-01…POL-95` + 9 appendix
drill banks `APX-1…APX-9`). Polity is the whole test bed: content pipeline, MCQ
provenance, gamification, spaced repetition, mocks, paywall — all built, tuned,
and proven on Polity before any second subject is authored.

The product is themed as a **paramilitary campaign**: topics are *territory* you
*conquer*, users hold a *rank* on a 14-grade CAPF ladder, they belong to a
*battalion* (weekly leaderboard cohort of ≤50), and streaks/XP drive daily
return. The campaign metaphor is not decoration — it is the information
architecture (see the territory map, Prompt 05).

**Two anchor documents — the source of truth for scope and content:**
- [docs/claude-code-build-book.md](docs/claude-code-build-book.md) — the 18-prompt build sequence (00-A, 00-B, then 01→18). Each prompt is one build unit and ends with **acceptance criteria that must pass before moving on**.
- [docs/polity-mvp-master.md](docs/polity-mvp-master.md) — the content model: every topic ID, MCQ floor, region grouping, and the MCQ provenance schema.
- [docs/screen-map.md](docs/screen-map.md) — maps the 22 design screens to build prompts. **The design wins where it conflicts with the build book** (the build book is one revision behind — e.g. 14 rank grades, not 10).

---

## 2. Build status — WHERE WE ARE

**Prompts 00-A through 13 are DONE and committed. Git clean. Next up: Prompt 14.**

| Prompt | Scope | State | Key commit |
|--------|-------|-------|-----------|
| 00-A/B | VPS bootstrap + PocketBase schema (14 collections) | ✅ | e4e3445 |
| 01 | Content repo, validator, PB sync, CI | ✅ | c38ef4e |
| 02 | MCQ ingestion CLI (Groq, OCR) | ✅ | ff07988 |
| 03 | SvelteKit PWA shell, design system, component library | ✅ | 3721bb1 |
| 04 | Auth (Google + email), onboarding, path ceremony | ✅ | 6172c96 |
| 05 | Territory map | ✅ | 52cb3ee |
| 06 | Topic reader + offline notes | ✅ | 7888045 |
| 07 | Quiz engine (server endpoints + player + results) | ✅ | cc11d19 |
| 08 | SM-2 spaced repetition (Revision Stack) + decay | ✅ | b1a6179 |
| 09 | XP, ranks, streaks, dashboard | ✅ | 77cbeb4 |
| 10 | Battalion leaderboards | ✅ | 0c904d7 |
| 11 | Test centre, sectionals, mock player | ✅ | eb8d099 |
| 12 | PYQ Vault (free, public) | ✅ | a0757ad |
| 13 | CA pipeline + Daily Briefing + admin queue | ✅ | 6cf8e44 (HEAD) |
| **14** | **Payments, paywall, referrals** | ⬅️ **NEXT** | — |
| 15 | Push (OneSignal) + analytics (PostHog) | ⬜ | — |
| 16 | PET tracker | ⬜ | — |
| 17 | Deployment, hardening, QA sweep | ⬜ | — |
| 18 | Beta cohort + launch instrumentation | ⬜ | — |

Extra design screens not yet built (see screen-map): **21 Community / Mess Hall**
(needs new `posts`/`challenges` collections; insert after Prompt 10) and
**22 Progress & Study Stats** (folds into the profile area, Prompt 09 phase).

**Prompt 14 (the next task) must deliver:** Razorpay one-time checkout (₹199
monthly = 30 days, ₹999 till-exam = `premium_until` Aug 31 2027), beta 50%
pricing priced *server-side*, the paywall screen (design Screen 15) + checkout
review + receipt (Screen 20), a single centralised **entitlement helper** used
by every gated server endpoint, an `ENTITLEMENTS.md` feature×tier matrix with a
Playwright test per row, premium-expiry nightly cron, and referral credits
(+7 premium days to *both* parties, granted **once, on the referred user's first
quiz completion** — not on signup — capped at 10/user). Note `referral_code`
resolution already exists at [pb/pb_hooks/referral.pb.js](pb/pb_hooks/referral.pb.js) (`GET /api/referral/{code}`); Prompt 04 stored `referred_by`. Prompt 14 adds the credit-granting side.

Full prompt text: search "PROMPT 14" in [docs/claude-code-build-book.md](docs/claude-code-build-book.md).

---

## 3. Golden rules (read every session)

1. **Follow the build book in order. Do not skip acceptance criteria.** A prompt is not "done" until its acceptance list is demonstrably met (tests, curl proofs, or reproduced behaviour). Commit per prompt with the existing message style: `feat(scope): Prompt NN — summary (Screens XX/YY)`.
2. **Design (docs/design) beats the build book on any conflict.** 14 ranks, screen layouts, copy — the design is canon. The build book's prose is a revision behind.
3. **Server is the only authority for anything that can be cheated.** XP, scores, entitlements, quiz answers, timers, payment state — computed and enforced in `pb_hooks`, never trusted from the client. `answer_index` must never appear in a network response before the user answers.
4. **Client math mirrors server math, and both are guarded by the same test table.** `src/lib/xp.ts` ↔ `pb/pb_hooks/lib/xp.js`; `src/lib/ranks.ts` ↔ the `RANKS` copy inside `lib/xp.js`. If you change one, change the other in the same commit.
5. **Never hard-delete content.** Sync retires (`status=retired`), never deletes — attempt history references questions. Sync also **never downgrades status** (a `live` question stays live even if the repo says `validated`).
6. **Everything fed in starts as `draft`.** Nothing ingested or AI-drafted goes live without human validation via the admin queue.
7. **Premium gating is server-trimmed, not CSS-hidden.** A free user's network payload for a gated topic contains only the teaser text — never ship full content and hide it.
8. **Keep this file and the docs honest.** When you finish a prompt, tick the status table above and note any new collection/env/convention.

---

## 4. Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | **SvelteKit 2 + Svelte 5 (runes)** | `.svelte.ts` files are rune-based stores (`$state`, `$derived`). |
| Language | **TypeScript, strict** | `pnpm check` = `svelte-check`. |
| Build target | **adapter-static** | Pure static SPA → Cloudflare Pages (Prompt 17). No SSR server at runtime. |
| Styling | **Plain CSS + design tokens** | `src/lib/styles/tokens.css`. **No Tailwind, no UI library.** Components hand-built from mockups. Dark theme default; `data-theme` toggle persisted. |
| Backend | **PocketBase** (single Go binary + SQLite) | Runs on an Oracle Always-Free ARM VPS behind Caddy. Custom logic in `pb_hooks` (JS VM). |
| Markdown | `marked` + `dompurify` | Notes render markdown → sanitised HTML. |
| AI | **Groq** (`llama-3.3-70b`) | Ingestion CLI + CA pipeline drafting. Key in `GROQ_API_KEY`. |
| Payments | **Razorpay** (Prompt 14) | Standard one-time checkout, not subscriptions. |
| Push / Analytics | OneSignal / PostHog (Prompt 15) | |
| Package manager | **pnpm** | Workspace repo (`pnpm-workspace.yaml`). |
| Tests | **vitest** (unit) + **Playwright** (e2e) | e2e in `/e2e`. |

---

## 5. Repository map

```
upscvidya/
├─ CLAUDE.md                 ← this file
├─ docs/
│  ├─ claude-code-build-book.md   ← the 18-prompt plan (scope source of truth)
│  ├─ polity-mvp-master.md        ← content model + MCQ provenance schema
│  ├─ screen-map.md               ← 22 screens → prompts (design wins)
│  └─ design/                     ← Fable 5 handoff: tokens.css, HTML mockups
├─ src/
│  ├─ routes/
│  │  ├─ (app)/               ← authed group, wrapped in BottomNav shell
│  │  │  ├─ map/  topic/[code]/  quiz/[code]/  revision/
│  │  │  ├─ tests/  tests/[attempt]/  briefing/  battalion/  profile/
│  │  ├─ login/  forgot/  onboarding/  path/       ← unauth + first-run
│  │  ├─ r/[code]/            ← referral landing (/r/CODE)
│  │  ├─ pyq/  pyq/[slug]/    ← PYQ vault (public, prerendered landings)
│  │  ├─ admin/               ← role-gated CA/question validation queue
│  │  └─ dev/kitchen-sink/    ← every component state, side by side
│  └─ lib/
│     ├─ pb.ts               ← typed PocketBase singleton (see §7)
│     ├─ types.ts            ← hand-written collection types (mirror SCHEMA.md)
│     ├─ *.svelte.ts         ← rune stores: auth, theme, toast, reader
│     ├─ xp.ts ranks.ts      ← client mirror of server progression math
│     ├─ map.ts polity.ts quiz.ts sr.ts test.ts board.ts ca.ts pyq.ts plan.ts
│     ├─ markdown.ts offline.ts
│     ├─ components/         ← Button Card Chip ProgressRing StreakFlame
│     │                        RankInsignia MapNode OptionRow BottomNav Sheet
│     │                        Modal Toast Skeleton RegionMap RankUp InstallPrompt
│     │                        OfflineNotes  (+ __tests__, index.ts barrel)
│     └─ styles/tokens.css
├─ content/                  ← Git-tracked source content, synced to PB
│  ├─ polity/POL-05-preamble/ {topic.md, mcqs.json}  (POL-10, POL-19 too)
│  └─ pyq/CAPF-2023/  CAPF-2024/  {mcqs.json}
├─ scripts/
│  ├─ content/  validate.js  sync.js  pyq-snapshot.js  lib.js
│  ├─ ingest/   ingest.js  parse.js  groq.js  dedupe.js
│  └─ gen-icons.mjs
├─ pb/                       ← PocketBase working dir (local dev)
│  ├─ pocketbase.exe         ← local binary (Windows dev)
│  ├─ pb_migrations/         ← schema as timestamped JS migrations (see §6)
│  ├─ pb_hooks/              ← custom API + business logic (see §7)
│  │  ├─ quiz.pb.js sr.pb.js test.pb.js board.pb.js ca.pb.js pyq.pb.js
│  │  ├─ users.pb.js referral.pb.js cron.pb.js
│  │  └─ lib/xp.js           ← the ONE awardXP path (shared via require)
│  ├─ pb_data/               ← local SQLite data (gitignored)
│  ├─ seed/                  ← dev seed (sample topics + questions)
│  └─ SCHEMA.md              ← every collection + API rule documented
└─ infra/
   ├─ setup.sh               ← idempotent VPS bootstrap
   ├─ Caddyfile pocketbase.service SERVER.md
   ├─ backup/                ← nightly snapshot + R2 sync
   └─ jobs/ca-pipeline/      ← cron Node job: PIB RSS → Groq → draft ca_items
```

---

## 6. Data model (PocketBase)

Full detail: **[pb/SCHEMA.md](pb/SCHEMA.md)** — read it before any schema change.

Schema lives as **timestamped JS migrations** in `pb/pb_migrations/` (apply in
order; a fresh PB + migrations reproduces the schema exactly). Existing:
`init_schema`, `topics_teaser`, `quiz_sessions`, `xp_badges`,
`anonymous_toggle`, `mock_tests`, `ca_pipeline`. **Add a new timestamped
migration; never edit an applied one.**

14 core collections: `users` (extends auth: xp, rank_code, streak_*, is_premium,
premium_until, battalion_id, referral_code, referred_by, role), `topics`,
`questions`, `attempts`, `topic_progress`, `sr_cards`, `tests`, `test_attempts`,
`ca_items`, `battalions`, `leaderboard_entries`, `pet_logs`, `payments`,
`referral_credits`. Plus `topics_public` (teaser view), `quiz_sessions`, and
badge storage.

**Critical API rules (enforced in schema, proven by acceptance curls):**
- `questions` are never bulk-listable by clients. Quiz delivery is via custom endpoints that strip `answer_index`.
- `attempts`, `sr_cards`, `topic_progress`, `test_attempts`, `pet_logs`: own records only (`user = @request.auth.id`).
- `topics.notes_md` hidden unless `is_free` OR `is_premium` OR `role=admin`; free users get the server-trimmed `topics_public` teaser.
- `ca_items`: public read for `status=published` only.
- `payments`: no client writes — server hooks only.
- `role="admin"` bypasses.

**Provenance:** every question carries a `source` block (`ai` | `self` |
`external` | `pyq` | `ca`) with required fields. Commercial-source questions are
**rewritten** (concept preserved, expression fresh); PYQs are kept **verbatim**.
Status lifecycle: `draft → validated → live → retired`. See master doc §MCQ.

---

## 7. PocketBase hooks — the sharp edges

Custom server logic is JS in `pb/pb_hooks/*.pb.js`, exposing `/api/*` routes and
record/cron hooks. Gotchas that will bite you:

- **JSVM isolation.** Each handler runs in an isolated pool VM. **File-scope helper functions are NOT visible inside a handler** — inline every helper inside its handler. The one sanctioned shared module is loaded at call time: `const xp = require(\`${__hooks}/lib/xp.js\`);`.
- **Hooks run as superuser**, so collection API rules are bypassed inside them. That is deliberate (quiz/SR/XP writes) — which is exactly why the client must never be trusted to do these writes.
- **Type reference:** each hook starts with `/// <reference path="../pb_data/types.d.ts" />` for editor types.
- **`lib/xp.js` is the single `awardXP` path.** Every XP mutation funnels through it. It holds its own copy of the 14-grade `RANKS` table (mirror of `src/lib/ranks.ts`) and the XP rules (tier multipliers, anti-farm: repeat-correct within 7 days = 0). Keep it in lock-step with the client mirror.
- Endpoint families already live: `/api/quiz/*` (start/state/answer/flag/finish), `/api/sr/*`, test/sectional composition, `/api/referral/{code}`, CA pipeline, PYQ. Prompt 14 adds `/api/pay/*` (order + verify + webhook) and referral-credit granting.

---

## 8. Commands

```bash
pnpm dev                 # SvelteKit dev server (port 5173; launch.json → upscvidya-dev)
pnpm build               # static build (must be zero-error before a prompt is done)
pnpm check               # svelte-check (strict TS)
pnpm lint                # eslint
pnpm format              # prettier
pnpm test                # vitest unit run
pnpm test:watch          # vitest watch

pnpm validate            # validate content/ against schema (exit non-zero on error)
pnpm sync -- --env dev   # upsert content → PocketBase (idempotent; retires, never deletes)
pnpm ingest -- --topic POL-08 --source "external:<name>" --file input.txt
pnpm pyq:snapshot        # regenerate src/lib/pyq-snapshot.json
```

**Local PocketBase (Windows dev):** run `pb/pocketbase.exe serve` from `pb/`
(hooks in `pb_hooks/`, data in `pb_data/`). Admin UI at `http://127.0.0.1:8090/_/`.

**Preview/verify UI changes:** use the in-app browser preview tooling
(`preview_start` with the `upscvidya-dev` launch config) — do not ask the user
to check manually.

---

## 9. Environment

`.env` (gitignored; template in `.env.example`):

| Var | Purpose |
|-----|---------|
| `PUBLIC_PB_URL` | PocketBase URL the client talks to. Dev `http://127.0.0.1:8090`; prod `https://api.<domain>`. |
| `PUBLIC_DEV_BYPASS_AUTH` | Was `true` before Prompt 04; **now `false`** (auth ships). Keep false. |
| `GROQ_API_KEY` | Groq key for ingestion CLI + CA pipeline. |

Coming (Prompt 14+): Razorpay key id/secret + webhook secret, OneSignal keys,
PostHog project key. Server-only secrets live on the VPS / CI, never in the
public client bundle (only `PUBLIC_*` vars reach the browser).

CI: GitHub Action runs `validate`, then `sync` to prod on push to `main` using
repo secrets `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` / `PB_URL`.

---

## 10. Conventions

- **Runes, not legacy stores.** New shared state = a `*.svelte.ts` module using `$state`/`$derived` (see `auth.svelte.ts`, `theme.svelte.ts`, `toast.svelte.ts`, `reader.svelte.ts`).
- **Typed PB access only** via the `pb` singleton in [src/lib/pb.ts](src/lib/pb.ts) — it maps collection names to hand-written types in `src/lib/types.ts`. Update `types.ts` whenever the schema changes.
- **Components** are added to `src/lib/components/`, exported through `index.ts`, given a vitest, and shown in `/dev/kitchen-sink` in every state. Match the mockups; don't restyle.
- **Design fidelity:** implement `docs/design` faithfully. Colours/spacing/typography come from `tokens.css` — no ad-hoc values.
- **Content edits** go through `content/` → `pnpm validate` → `pnpm sync`, never by editing PB directly (except transient dev data).
- **Commits:** one per build prompt, Conventional-Commits style matching git history. Only commit/push when the user asks.
- **Offline:** notes are cache-for-offline; everything write-based (quizzes, reviews, submits) is online-only with a clean offline error state.

---

## 11. Pitfalls that have already been solved (don't regress)

- The **14-grade rank ladder** is canonical (design), and it exists in **two mirrored copies** (`src/lib/ranks.ts` and `RANKS` in `pb/pb_hooks/lib/xp.js`). Editing one without the other silently desyncs client display from server truth.
- **`answer_index` leakage:** quiz options are server-shuffled; the original-index mapping stays in the `quiz_sessions` row. Never return the mapping or the raw answer before the user answers.
- **Sync must stay idempotent** and must never downgrade `status` or hard-delete — attempt history depends on retired questions surviving.
- **PB hook helpers must be inlined** per handler (JSVM isolation) — a helper that "works in one handler" will be `undefined` in the next.
- **Free-tier content is server-trimmed**, not client-hidden — verify payloads in devtools when touching gating.

---

*Last synced to repo state at commit 6cf8e44 (Prompt 13 complete). When you
finish a prompt, update §2 and any changed convention here in the same commit.*
