# CLAUDE.md — UPSCVidya

> Operating manual for any coding agent working this repo. Read top to bottom
> before touching code. This file is the anti-context-loss guarantee: if a
> session or account switches, everything needed to continue at full quality is
> here or pointed to from here. Keep it current — update the **Build Status**
> table and any changed convention the moment it changes.

---

## 0. Session Lifecycle — READ FIRST, EVERY NEW SESSION

**Recover state cheaply. Do not scan the repository on startup.**

On a fresh session, read only these, in order, then summarise and **wait**:
1. [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) — current goal, what's in flight, what's next, which files, the Do-NOT list.
2. [docs/PROJECT_INDEX.md](docs/PROJECT_INDEX.md) — thing → path map (use instead of Glob/Grep).
3. [DECISIONS.md](DECISIONS.md) — locked architecture decisions (mandatory read).
4. This file (§2 build status, §3 golden rules).

**On a new machine** (the repo was just cloned or handed over), do
[docs/DEV_SETUP.md](docs/DEV_SETUP.md) first — `.env`, the pinned PocketBase
binary and `pb_data/` are all untracked, so the repo does not run out of the box.

Then inspect **only** the files named in CURRENT_STATE.md. Do **not** run
repo-wide `Glob`/`Grep`/`Explore` unless the task needs a file the index
doesn't list — then read that one file, don't sweep.

### Repository Search Policy

Never search the repository unless one is true:
- CURRENT_STATE.md doesn't name the file, AND
- PROJECT_INDEX.md doesn't name the module, OR
- the user explicitly requests a search.

Searching the repo is expensive. Prefer targeted single-file reads.

**Ending a session (do this before you stop, instead of `/compact`):**
1. Rewrite [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) (keep it <500 words): Completed / In progress / Next / Active files / Notes.
2. Update [docs/PROJECT_INDEX.md](docs/PROJECT_INDEX.md) only if files moved or were added.
3. Update DECISIONS.md only if an architectural decision changed.
4. User then runs `/clear` (free) — **not** `/compact` (re-reads the whole window, expensive).

**Why:** every turn re-bills the whole context; `/compact` and post-limit
resumes pay for the entire window at once. A small window + a state file is the
fix. One feature per session; `/clear` between features.

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
- [docs/API.md](docs/API.md) — every network surface: all 37 custom `/api/*` endpoints (by consumer), the PocketBase built-ins the client uses, crons, and the content CLI. Update it in the same commit as any route/rule/cron change.
- [pb/SCHEMA.md](pb/SCHEMA.md) — every collection, rule, and server-side subsystem (quiz/SR/XP/board/test/CA/pay/notify), migration by migration.
- [ENTITLEMENTS.md](ENTITLEMENTS.md) — the free-vs-premium matrix, enforced through `entitle.js`.

---

## 2. Build status — WHERE WE ARE

**Prompts 00-A through 16 are DONE. Git clean.**

⚠️ **The build-book sequence is deliberately paused.** Prompt 17 is *not* the
current task. The live goal is **making the app installable on a phone** —
hosting, HTTPS, install guide — tracked in
[docs/BETA_SETUP.md](docs/BETA_SETUP.md) and
[docs/CURRENT_STATE.md](docs/CURRENT_STATE.md), which is the authority on what to
do next. Prompt 17 and content authoring both resume after that.

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
| 13 | CA pipeline + Daily Briefing + admin queue | ✅ | 6cf8e44 |
| 14 | Payments (Razorpay), paywall, entitlements, referrals | ✅ | e75d0ed |
| 15 | Push (OneSignal) + analytics (PostHog) | ✅ | 406108d |
| 16 | Fitness tracker "Drill Ground" (pivot from PET) | ✅ | f753bc6 |
| **17** | **Deployment, hardening, QA sweep** | ⏸ **paused** (beta install first) | — |
| 18 | Beta cohort + launch instrumentation | ⬜ | — |

Extra design screens not yet built (see screen-map): **21 Community / Mess Hall**
(needs new `posts`/`challenges` collections; insert after Prompt 10) and
**22 Progress & Study Stats** (folds into the profile area, Prompt 09 phase).

**Extras shipped outside the prompt sequence** (all committed, tested, green):

1. *Ustad's walkthrough* — a Clash-of-Clans-style first-run guided tour
   (drill-instructor "Ustad") across Home → Map → Topic → Quiz → Drill Ground.
   Engine [tour.svelte.ts](src/lib/tour.svelte.ts), overlay
   [TourGuide.svelte](src/lib/components/TourGuide.svelte) (mounted in the (app)
   layout), avatar [UstadAvatar.svelte](src/lib/components/UstadAvatar.svelte).
   Targets are `data-tour="…"` attributes; auto-starts once for a
   freshly-onboarded user (`users.tour_done`), replayable from Profile settings.
   ⚠️ It navigates to each step's route, so it will bounce you to Home on load
   for a `tour_done=false` user — set `localStorage['tour-seen']='1'` (or
   `tour_done`) to suppress while debugging other screens.
2. *Motion polish* (commit 57c5994) — cold-start [Splash.svelte](src/lib/components/Splash.svelte),
   View-Transitions route/tab animations + quiz question slides (root layout +
   `src/app.css`), all `prefers-reduced-motion`-safe.
3. *Profile hub redesign + native mobile gestures* (commit 3bf1275) — the
   profile is now a **game-style hub** ([profile/+page.svelte](src/routes/(app)/profile/+page.svelte))
   with dedicated sub-routes `profile/ranks`, `profile/decorations`,
   `profile/billing`, `profile/settings`. 25 achievement emblems in
   [BadgeIcon.svelte](src/lib/components/BadgeIcon.svelte) (unique SVG per badge,
   earned/locked). Native: edge-swipe-to-go-back
   [EdgeSwipe.svelte](src/lib/components/EdgeSwipe.svelte) (mounted in root
   layout) + [native.ts](src/lib/native.ts) (haptics/isTouch); `app.css` kills
   pull-to-refresh / tap-flash / tap-delay; safe-area insets on shell + nav.
4. *CA manual ingestion + Monthly Current Affairs* (commit 8f8ff1b) — admins
   paste raw notes → AI drafts briefs+MCQs into the queue
   (`/api/ca/compose`, [ca_extra.pb.js](pb/pb_hooks/ca_extra.pb.js)); a
   [briefing/monthly](src/routes/(app)/briefing/monthly/+page.svelte) view
   compiles every day's CA MCQs into a monthly practice set through the test
   engine. Needs an AI key on the PB server for the AI path (heuristic/
   manual `items` array otherwise). Fixed a shared bug: the test engine coerced
   a legit `0` negative-marking to `0.667` (`cfg.negative || 0.667`) — now
   nullish-guarded.
5. *Gamified Test Centre + in-test guard + leaderboard showcase* — Test Centre
   ([tests/+page.svelte](src/routes/(app)/tests/+page.svelte)) rebuilt as a
   command hub (ops-run · best-percentile · avg-accuracy, all real from
   `test_attempts`) with 3 pill tabs (Mock Ops · Drills · **Record** = attempt
   history) and medal-graded mission cards. The mock player
   ([tests/[attempt]](src/routes/(app)/tests/[attempt]/+page.svelte)) blocks
   leaving a running test via `beforeNavigate` → an "Abort the operation?" modal
   → submit → evaluation, only then navigation is free (+ `beforeunload`).
   Battalion board now shows each aspirant's **rank name** (rows + podium +
   mini-profile) and their chosen **featured badges** (`users.featured_badges`,
   ≤5, picked in `profile/decorations`, masked for anonymous users; server adds
   them to `/api/board` rows). [Modal.svelte](src/lib/components/Modal.svelte)
   got a spring pop, backdrop fade, safe-area padding + scroll.
6. *Base Camp v2 — game-app home* ([(app)/+page.svelte](src/routes/(app)/+page.svelte))
   — a full gamified rebuild of the dashboard: HUD (insignia + XP bar to next
   rank with a ghosted next-rank preview + streak w/ **at-risk** state), a
   **Daily Objectives** quest card (3 quests derived from today's `xp_events` —
   `topic_quiz` / `sr_review` / `daily_ca`+briefing — with a done-count ring,
   per-quest XP chips, progress tracks, and a "Day secured" all-clear state),
   a **Campaign** strip (front-region % + held/103 + next node → map), **rival**
   (battalion rank + XP gap + live week countdown) and **next-medal** tiles, a
   weekly-momentum bar (today lit), and a tidy quick-actions grid. Motion: XP/
   held/week **count-ups** (`tweened`), **sheen** sweeping the progress bars,
   momentum bars **grow-in**, ghost-rank **breathe**, undone-quest chip **glow**,
   check-pop + all-clear burst, staggered card entrance, press-scale + haptics —
   all `prefers-reduced-motion`-guarded. ⚠️ The Ustad tour targets live here:
   `data-tour="home-hero"` (HUD), `home-mission` (quests), `home-ring` (campaign)
   — keep those attributes if you touch this file.

7. *FIELD DOSSIER redesign* — the whole app moved onto the new visual system
   (see **§4.1**): `tokens.css` v4 palette + [dossier.css](src/lib/styles/dossier.css)
   material utilities, Big Shoulders Display / Barlow fonts, and a moulded
   [BottomNav](src/lib/components/BottomNav.svelte). Rebuilt to the handoff:
   **Base** (brass rank plate · ink ribbon · wax-seal streak · ammo-belt XP ·
   rubber-stamp objective ring · dark campaign panel), **Test Centre** (mock
   papers as sealed operation folders with a spine rail + flap tag),
   **Profile** (brass rank board · service bars · dark MEDAL CASE hexagons ·
   dossier rows), **Map** (sector folder tabs). Extrapolated to the rest:
   OptionRow (moulded answer keys + sockets), battalion podium/rows, Drill
   Ground, paywall, Button/Card/Chip. ⚠️ Screens inherit the palette
   automatically via tokens — when restyling, delete the old
   `background/border/box-shadow` before adding a `.plate`, or they fight.
   **Map (2a) in full:** [RegionMap.svelte](src/lib/components/RegionMap.svelte)
   was rewritten from a fixed-width SVG (which squeezed all N nodes into one
   screen) into an **HTML terrain panel that scrolls horizontally** — survey
   grid, terrain masses, dashed FRONT LINE, and markers on a fixed 94px step
   wave, so a 14-territory sector keeps every marker readable. Markers: brass
   disc + `01` number when held or current (rust ring + pulse on the objective),
   dashed outpost otherwise, hex bunker for drills (🔒 when locked). The
   `ATTACK <next> →` order is pinned over the terrain so it never scrolls away.
   Collapsed sectors are `.dossier-row`s with roman-numeral tiles; a sector
   reads "locked" only when every one of its chapters is `premiumLocked`
   (there is no region-level lock — free roam for READING is absolute).
   **Base 4a + reward moments:** the Base header is a full-bleed **command post**
   (dark olive band, rotating rays, a live conic **XP ring** around the brass
   grade disc, wax-seal streak, dark magazine belt) followed by a **hero
   next-mission card** (terrain preview + brass disc + DEPLOY). Two ceremony
   components carry the reward beats, both `prefers-reduced-motion`-gated with
   the shared keyframes at the bottom of dossier.css (`raySpin`, `confettiFall`,
   `popIn`, `rise`, `barGrow`, `xpFly`, `sparkUp`, `stampIn`, `chevRise`,
   `medalShine`, `floatBob`, `flameFlicker`):
   [RankUp.svelte](src/lib/components/RankUp.svelte) = **4c promotion ceremony**
   (rays, confetti, chevrons rising onto a brass plate, spoils, next-rank bar)
   and [TerritoryCaptured.svelte](src/lib/components/TerritoryCaptured.svelte) =
   **4d conquest** (flag plants, score/accuracy/best-run stamps, sector bar,
   next-front unlock), shown on a passing topic quiz ahead of the score card.
   **Turn 3 applied:** 3a reader (FIELD NOTE callouts) · **3b quiz** (olive
   command band + ammo-belt dots, question sheet, recessed statements/verdict
   notes, dossier results & review) · **3c drill composer** (mission-planning
   board: olive battlefield chips, rust threat dial, brass size selector, dashed
   briefing slip, `LAUNCH DRILL` key) · **3d empty record** (unstamped service
   file: dashed NO-RECORD ring + ghost stat tiles) · **3e briefing** (brass
   MONTHLY CA tab, olive-stamped date tabs, `DISPATCH NOT IN YET` sheet with the
   07 dial). The admin validation queue was restyled too (outside turn 3).
   **3f rank ladder** ([profile/ranks](src/routes/(app)/profile/ranks/+page.svelte))
   — glowing brass **summit plate** (Director General, grade 14), future rungs
   recessed into the canvas, the rung above you raised on card stock with a rust
   `NEXT UP` caption, an arrow marker reading `N XP TO PROMOTION`, a rust
   `YOU ARE HERE` card with the XP track, and cleared rungs dashed back.
   **3g decorations** ([profile/decorations](src/routes/(app)/profile/decorations/+page.svelte))
   — a felt-lined presentation case: dark **BATTALION BOARD** panel (5 slots,
   pinned medals bob + shine, empty ones are recessed sockets, brass rail,
   `EDIT BOARD` toggles a **pin mode** where tapping an earned medal pins/unpins
   it instead of opening the sheet), a struck / on-board / latest stat strip,
   then one dark case per **real** badge category (Campaign · Regions Secured ·
   Streaks in rust · Battalion · Drill Ground) covering all 25 codes in
   `BADGES` — struck medals lit and shine-swept, unearned pressed into the felt
   as dimmed sockets. The mockup's "closest decoration" progress card and its
   RAREST/NEXT tiles were dropped: no per-badge progress exists client-side.

**🔒 Locked decisions (honour when the relevant prompt lands):**
- **Open, completely-free beta** via a single global `beta_free_until` date checked in `entitle.entitled()` (self-expiring, no per-user writes), + `beta_founder` badge on signup → converts to the forever-50% price. **Build in Prompt 18.** Full spec: the 🔒 note after Prompt 18 in [docs/claude-code-build-book.md](docs/claude-code-build-book.md).
- **Pricing:** build-book matrix — monthly ₹199→₹99, till-exam ₹999→₹499; ₹399/₹1999 struck as MRP. Server (`entitle.js`) is the only price authority.

**Prompt 14 (DONE) delivered:** Razorpay one-time checkout (₹199→₹99 monthly =
30 days, ₹999→₹499 till-exam = `premium_until` 2027-08-31; beta price for
`beta_founder`, computed server-side); single **entitlement/pricing/grant
module** [pb/pb_hooks/lib/entitle.js](pb/pb_hooks/lib/entitle.js) (`require`d by
quiz/sr/test/ca gating too); [pb/pb_hooks/pay.pb.js](pb/pb_hooks/pay.pb.js)
order/verify/webhook/restore with the `payments` row as idempotency ledger
(no double-extend on replay); nightly `premium_expiry` cron; paywall
([src/routes/(app)/paywall](src/routes/(app)/paywall/+page.svelte), Screen 15) +
checkout/success (Screen 20); profile Plan&Billing + receipt + restore +
Recruit-a-batchmate referral share; monthly expiry banner in the app layout;
referral credits (+7 days both parties, once on referred user's first quiz
finish, cap 10, banked as `premium_credit_days` for free users);
[ENTITLEMENTS.md](ENTITLEMENTS.md) matrix. Dev/e2e payments run offline with
`PAY_SIMULATE=1` (no Razorpay keys).

**Prompt 15 (DONE) delivered:** OneSignal web push — worker scoped to `/push/`
(coexists with the SvelteKit SW at `/`), prompt only *after* first quiz
(`shouldPromptPush`), per-user tags; server sends via
[lib/notify.js](pb/pb_hooks/lib/notify.js) + 4 crons with per-type opt-outs
honoured server-side (`notification_prefs`); `/api/notify/preview|test`. PostHog
via a thin HTTP client [analytics.ts](src/lib/analytics.ts) (no SDK) — 13 funnel
events, identify by PB id, no PII (`sanitize`), `analytics_minimal` toggle;
[POSTHOG.md](POSTHOG.md) documents the 4 dashboards. All external wiring is
gated on keys (unset ⇒ no-op / dry-log).

**Prompt 16 (DONE) — "The Drill Ground"** (`/pt`), a training-only home-workout
tracker (pivot from PET). Catalog = client constants [pt.ts](src/lib/pt.ts) (21
exercises, 4 circuits, level bands); [workout.svelte.ts](src/lib/workout.svelte.ts)
offline queue (localStorage, client_id idempotency, flush on online/boot);
`workout_logs` collection unique on (user, client_id); [pt.pb.js](pb/pb_hooks/pt.pb.js)
awards ~40 XP + PT streak + fitness badges on the first workout of the IST day
(UTC-instant day window — logged_at is stored UTC). Circuit player with interval
timer batch-logs each exercise. Dashboard quick-action + profile weekly-goal +
`pt_reminder` push. ⚠️ **TZ gotcha baked in:** any "same IST day" DB query must
bound by the UTC instants of that IST day, never the IST date label as a UTC
string (off-by-5.5h).

**Prompt 17 (the next task) must deliver:** production deployment (Cloudflare
Pages for the static app + custom domain), VPS/API hardening (Caddy rate limits,
CORS lockdown, PB admin IP-allowlist, health + uptime monitoring), a full
Playwright golden-path run against preview, a Lighthouse perf pass, a backup
restore drill, and a security sweep of every earlier acceptance. Full text:
search "PROMPT 17" in [docs/claude-code-build-book.md](docs/claude-code-build-book.md).

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
| Styling | **Plain CSS + design tokens + material utilities** | `src/lib/styles/tokens.css` (v4 "Field Dossier") + `src/lib/styles/dossier.css` (global material classes). **No Tailwind, no UI library.** Light default; `data-theme="dark"` night variant. See §4.1. |
| Backend | **PocketBase** (single Go binary + SQLite) | Runs on an Oracle Always-Free ARM VPS behind Caddy. Custom logic in `pb_hooks` (JS VM). |
| Markdown | `marked` + `dompurify` | Notes render markdown → sanitised HTML. |
| AI | **5-provider failover chain**: OpenRouter (Nemotron 3 Ultra) → Gemini → Mistral → OpenCode Zen → Groq | Ingestion CLI + CA pipeline drafting. All five speak the OpenAI chat-completions shape, so only base URL/model/key differ. A call starts at the first configured provider and **falls over** to the next on 429/401/403/404 or persistent errors, throwing only when all are spent — so a batch survives one provider's daily cap. `AI_PROVIDER=openrouter\|gemini\|mistral\|opencode\|groq` **pins** the chain to one (no failover). Quotas differ by orders of magnitude (50/day vs 50/min). |
| Payments | **Razorpay** (Prompt 14) | Standard one-time checkout, not subscriptions. |
| Push / Analytics | OneSignal / PostHog (Prompt 15) | |
| Package manager | **pnpm** | Workspace repo (`pnpm-workspace.yaml`). |
| Tests | **vitest** (unit) + **Playwright** (e2e) | e2e in `/e2e`. |

### 4.1 The FIELD DOSSIER design language (current visual system)

Source: **`Army game app redesign directions/Force Prep - Gamified Directions.dc.html`**
(Fable handoff; direction **1a "Field Dossier"** was chosen, and 2a/2b/2c roll it
out to Map / Test Centre / Profile). It supersedes the older v3 "Field Manual"
look — the earlier `docs/design` mockups are still the source of truth for
*layout, copy and IA*, but **colour/material/typography now come from here**.

The system is **physical material, not flat UI**, and two rules carry all of it:

- **RAISED** = hard *bottom* edge `0 3px 0 var(--edge)` + soft ambient shadow +
  a white top inset (`var(--emboss)`). Buttons press to `0 1px 0` +
  `translateY(2px)`.
- **RECESSED** = darker fill + inset top shadow (`var(--recess-in)`).
  Light always comes from above.

Compose screens from the **global utility classes** in
[dossier.css](src/lib/styles/dossier.css) — do **not** re-declare gradients:
`.plate` / `.plate-lift` / `.plate-dark` (card stock & inverted panels),
`.recess`, `.btn3d` (+`-gold` `-olive` `-quiet`), `.segbar`+`.seg`
(ammo-belt progress), `.track`+`.fill`, `.brass` (rank plate), `.seal`
(wax-seal medallion), `.stamp` (rotated dashed ring), `.stencil`, `.label`,
`.ribbon`, `.tag` (floating FREE/PREMIUM flap), `.statchip`, `.tabrail`+`.tab`,
`.foldertab` (map sector tabs), `.dossier-row`+`.row-ico/.row-body/.chev`,
`.hex` (medal case).

Type: **Big Shoulders Display** 800 (stencil headings, numbers, buttons) ·
**Barlow** (body) · **Barlow Condensed** (stat chips). Accents: rust `--orange`
(primary action), brass `--gold-*` (reward/premium), olive `--green` (success),
khaki `--khaki` (identity), `--red` (alarm).

---

## 5. Repository map

```
upscvidya/
├─ CLAUDE.md                 ← this file
├─ docs/
│  ├─ claude-code-build-book.md   ← the 18-prompt plan (scope source of truth)
│  ├─ polity-mvp-master.md        ← content model + MCQ provenance schema
│  ├─ screen-map.md               ← 22 screens → prompts (design wins)
│  ├─ API.md                      ← every endpoint + collection + cron (keep current)
│  ├─ DEV_SETUP.md                ← new machine / handover: .env, PB binary, pb_data
│  ├─ BETA_SETUP.md               ← the current goal: hosting → installable PWA
│  └─ design/                     ← Fable 5 handoff: 22 screen mockups (layout/copy/IA)
├─ Army game app redesign directions/  ← Fable handoff: FIELD DOSSIER visual system (§4.1)
├─ ENTITLEMENTS.md  POSTHOG.md    ← free/premium matrix · analytics dashboards
├─ src/
│  ├─ routes/
│  │  ├─ (app)/               ← authed group, wrapped in BottomNav shell
│  │  │  ├─ map/  topic/[code]/  quiz/[code]/  revision/
│  │  │  ├─ tests/  tests/[attempt]/  battalion/  pt/  pt/[routine]/
│  │  │  ├─ briefing/  briefing/monthly/          ← daily + monthly CA
│  │  │  ├─ paywall/  checkout/                    ← Prompt 14 (Screens 15/20)
│  │  │  └─ profile/  profile/{ranks,decorations,billing,settings}/ ← hub + sub-screens
│  │  ├─ login/  forgot/  onboarding/  path/       ← unauth + first-run
│  │  ├─ r/[code]/            ← referral landing (/r/CODE)
│  │  ├─ pyq/  pyq/[slug]/    ← PYQ vault (public, prerendered landings)
│  │  ├─ admin/               ← role-gated CA/question queue + text→AI composer
│  │  └─ dev/kitchen-sink/    ← every component state, side by side
│  └─ lib/
│     ├─ pb.ts               ← typed PocketBase singleton (see §7)
│     ├─ types.ts            ← hand-written collection types (mirror SCHEMA.md)
│     ├─ *.svelte.ts         ← rune stores: auth, theme, toast, reader
│     ├─ xp.ts ranks.ts      ← client mirror of server progression math
│     ├─ map.ts polity.ts quiz.ts sr.ts test.ts board.ts ca.ts pyq.ts plan.ts
│     ├─ pay.ts push.ts analytics.ts native.ts   ← money · push · PostHog · haptics
│     ├─ tour.svelte.ts workout.svelte.ts pt.ts   ← tour engine · fitness store/catalog
│     ├─ markdown.ts offline.ts
│     ├─ components/         ← Button Card Chip ProgressRing StreakFlame
│     │                        RankInsignia MapNode OptionRow BottomNav Sheet
│     │                        Modal Toast Skeleton RegionMap RankUp InstallPrompt
│     │                        OfflineNotes Splash BadgeIcon EdgeSwipe
│     │                        TourGuide UstadAvatar  (+ __tests__, index.ts)
│     └─ styles/  tokens.css (v4 palette)  dossier.css (material utilities)
├─ content/                  ← Git-tracked source content, synced to PB
│  ├─ polity/POL-05-preamble/ {topic.md, mcqs.json}  (POL-10, POL-19 too)
│  └─ pyq/CAPF-2023/  CAPF-2024/  {mcqs.json}
├─ scripts/
│  ├─ content/  validate.js  sync.js  pyq-snapshot.js  lib.js
│  ├─ ingest/   ingest.js  parse.js  ai.js  dedupe.js
│  └─ gen-icons.mjs
├─ pb/                       ← PocketBase working dir (local dev)
│  ├─ pocketbase.exe         ← local binary (Windows dev)
│  ├─ pb_migrations/         ← schema as timestamped JS migrations (see §6)
│  ├─ pb_hooks/              ← custom API + business logic (see §7 · docs/API.md)
│  │  ├─ quiz.pb.js sr.pb.js test.pb.js board.pb.js pyq.pb.js
│  │  ├─ ca.pb.js ca_extra.pb.js   ← daily/admin CA · manual ingest + monthly
│  │  ├─ pay.pb.js notify.pb.js pt.pb.js   ← payments · push · fitness
│  │  ├─ users.pb.js referral.pb.js cron.pb.js
│  │  └─ lib/  xp.js  entitle.js  notify.js   ← shared modules (require at call time)
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
order; a fresh PB + migrations reproduces the schema exactly). In order:
`init_schema`, `topics_teaser`, `quiz_sessions`, `xp_badges`,
`anonymous_toggle`, `mock_tests`, `ca_pipeline`, `payments_referrals`,
`notifications`, `workout_logs`, `tour`, `featured_badges`. **Add a new
timestamped migration; never edit an applied one.** (New collections since the
init 14: `quiz_sessions`, `topics_teaser`/`topics_public` views, `badges`,
`xp_events`, `sources`, `jobs_log`, `workout_logs`; plus added `users` fields —
`anonymous`, `premium_credit_days`, `notification_prefs`, `analytics_minimal`,
`pt_weekly_goal`, `tour_done`, `featured_badges` — and `ca_items` pipeline
fields.)

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
- **Quiz length is uncapped**: `/api/quiz/start` serves the topic's whole live pool. The UI must show the real count from `live_questions` (SQL-computed on `topics_public`/`topics_teaser`, migrations 1754100000/1754200000) — **never `mcq_floor`**, which is only an authoring target.
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

- **JSVM isolation.** Each handler runs in an isolated pool VM. **File-scope helper functions are NOT visible inside a handler** — inline every helper inside its handler. The sanctioned shared modules load at call time via `require`: `lib/xp.js` (awardXP), `lib/entitle.js` (entitlement + pricing + premium grant), `lib/notify.js` (push send). e.g. `const ent = require(\`${__hooks}/lib/entitle.js\`);`.
- **JSON/date fields come back "raw."** `record.get(jsonField)` returns a type whose `typeof` is `"object"` but whose properties read `undefined` — parse the STRING form first (`JSON.parse(String(v))`). Date fields return an always-truthy object — test with `String(v).trim() !== ""`, never `!!v`. Both bit us in test.pb.js/ca.pb.js; the `asObj`/`asArr`/`isSet` inline helpers are the fix.
- **Falsy-coercion trap:** `cfg.negative || 0.667` turns a legit `0` into the default. Use `== null ?` guards for any config value where 0 is valid (fixed across the test engine for practice sets).
- **Outbound HTTP** from a hook uses `$http.send({url,method,headers,body,timeout})` and server env via `$os.getenv(...)` (see pay.pb.js, notify.js, ca_extra.pb.js Groq call).
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
pnpm sync -- --env dev   # upsert content → PocketBase (idempotent; retires, never deletes) — lands as draft
pnpm promote -- --env prod --topic POL-06   # draft → live (topic + its questions). --all, --dry-run, --include-ca

pnpm ingest -- --topic POL-08 --source "external:<name>" --file input.txt
pnpm pyq:snapshot        # regenerate src/lib/pyq-snapshot.json
pnpm repair:pyq -- --env prod [--apply]   # one-off: un-retire PYQs killed by the old sync bug (dry run by default)
```

**Local PocketBase:** run `pb/pocketbase serve` (`pocketbase.exe` on Windows)
from `pb/` — hooks in `pb_hooks/`, data in `pb_data/`. Admin UI at
`http://127.0.0.1:8090/_/`. The binary and `pb_data/` are **untracked**: on a
fresh machine, download **v0.39.7** and follow [docs/DEV_SETUP.md](docs/DEV_SETUP.md).

**Preview/verify UI changes:** drive a real browser via the **Chrome DevTools
MCP** server (`mcp__chrome-devtools__*`, declared in [.mcp.json](.mcp.json)) —
do not ask the user to check manually. Start PocketBase
(`pb/pocketbase.exe serve --http=127.0.0.1:8090`) and `pnpm dev` (5173) first,
and pass an `initScript` setting `localStorage['tour-seen']='1'` or the Ustad
tour will navigate away from the route under test. The server runs `--isolated`
(fresh Chrome profile), so `(app)` routes need a login each run. `resize_page`
sizes the window, not the viewport — use `emulate` for true mobile metrics.
(The desktop app's `preview_start` is not available in the VS Code extension.)

---

## 9. Environment

`.env` (gitignored; template in `.env.example`):

| Var | Purpose |
|-----|---------|
| `PUBLIC_PB_URL` | PocketBase URL the client talks to. Dev `http://127.0.0.1:8090`; prod `https://api.<domain>`. |
| `PUBLIC_DEV_BYPASS_AUTH` | Was `true` before Prompt 04; **now `false`** (auth ships). Keep false. |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | AI for the ingestion CLI + CA pipeline. Model defaults to `nvidia/nemotron-3-ultra-550b-a55b:free`. Also needed as **PB server env** for `/api/ca/compose`. |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Google via its OpenAI-compat shim. `gemini-3.6-flash`, 1M ctx, ~5s/question. The stored key is an **Antigravity** (`AQ.*`) key, not AI Studio (`AIza*`) — Pro models 429 on it, Flash is fine. |
| `GROQ_API_KEY` / `GROQ_MODEL` | `llama-3.3-70b-versatile`, free tier 1000 req/day + 12k tok/min, ~1s/question (vs ~25s on Nemotron). |
| `MISTRAL_API_KEY` / `MISTRAL_MODEL` | `mistral-large-latest`, 262k ctx. Free tier 50 req/min + 50k tok/min — the **token** cap binds first at our prompt size (~33 calls/min), hence the 1800ms client spacing. |
| `OPENCODE_API_KEY` / `OPENCODE_MODEL` | OpenCode Zen gateway (`opencode.ai/zen/v1`), every model free tier. `deepseek-v4-flash-free` (~2s). No rate-limit headers; `ling-3.0-flash-free` 400s upstream and `laguna-s-2.1-free` 429s — don't pick those. |
| `AI_PROVIDER` | Pin to `openrouter` \| `gemini` \| `mistral` \| `opencode` \| `groq` — disables failover, spends only that quota. Unknown value throws. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Payments (Prompt 14). **PocketBase server env only** — read by `pay.pb.js` via `$os.getenv`, never in the client bundle. |
| `PAY_SIMULATE` | Set `1` (with no Razorpay keys) to run the payment flow offline for dev/e2e. Ignored/unsafe-free in prod (keys present ⇒ simulation unreachable). |
| `PUBLIC_ONESIGNAL_APP_ID` | OneSignal web push app id (client SDK). Must exist (even empty) for `$env/static/public` to resolve; empty ⇒ push no-op. |
| `ONESIGNAL_APP_ID` / `ONESIGNAL_REST_KEY` | Server-only (cron sends via `$os.getenv`). Absent ⇒ dry-log, no send. |
| `PUBLIC_POSTHOG_KEY` / `PUBLIC_POSTHOG_HOST` | PostHog capture (client). Must exist (even empty) for the static import; empty ⇒ analytics no-op. |

All server-only secrets live on the VPS / CI, never in the public client bundle
(only `PUBLIC_*` vars reach the browser). **Note:** any `PUBLIC_*` var the code
imports from `$env/static/public` must be present in `.env` (empty is fine) or
the build fails. `.env` is **gitignored and never travels with the repo** —
moving to a new machine means copying it across out of band
([docs/DEV_SETUP.md](docs/DEV_SETUP.md) §2).

CI: GitHub Action runs `validate`, then `sync` to prod on push to `main` using
repo secrets `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` / `PB_URL`.

---

## 10. Conventions

- **Runes, not legacy stores.** New shared state = a `*.svelte.ts` module using `$state`/`$derived` (see `auth.svelte.ts`, `theme.svelte.ts`, `toast.svelte.ts`, `reader.svelte.ts`).
- **Typed PB access only** via the `pb` singleton in [src/lib/pb.ts](src/lib/pb.ts) — it maps collection names to hand-written types in `src/lib/types.ts`. Update `types.ts` whenever the schema changes.
- **Components** are added to `src/lib/components/`, exported through `index.ts`, given a vitest, and shown in `/dev/kitchen-sink` in every state. Match the mockups; don't restyle.
- **Design fidelity:** `docs/design` owns layout/copy/IA; the **Field Dossier** handoff (§4.1) owns colour, material and type. Compose from `dossier.css` utilities + `tokens.css` variables — no ad-hoc hex or one-off gradients.
- **Content edits** go through `content/` → `pnpm validate` → `pnpm sync` → `pnpm promote`, never by editing PB directly (except transient dev data). Sync lands everything as `draft` (invisible); **promote is what publishes it**. Forgetting promote is the single most likely reason "I synced a chapter and users can't see it".
- **Commits:** one per build prompt, Conventional-Commits style matching git history. Only commit/push when the user asks.
- **Offline:** notes are cache-for-offline; everything write-based (quizzes, reviews, submits) is online-only with a clean offline error state.

---

## 11. Pitfalls that have already been solved (don't regress)

- The **14-grade rank ladder** is canonical (design), and it exists in **two mirrored copies** (`src/lib/ranks.ts` and `RANKS` in `pb/pb_hooks/lib/xp.js`). Editing one without the other silently desyncs client display from server truth.
- **`answer_index` leakage:** quiz options are server-shuffled; the original-index mapping stays in the `quiz_sessions` row. Never return the mapping or the raw answer before the user answers.
- **Sync must stay idempotent** and must never downgrade `status` or hard-delete — attempt history depends on retired questions surviving.
- **PB hook helpers must be inlined** per handler (JSVM isolation) — a helper that "works in one handler" will be `undefined` in the next.
- **Free-tier content is server-trimmed**, not client-hidden — verify payloads in devtools when touching gating.
- **`dossier.css` class names are global** — `.chev`, `.tab`, `.plate`, `.seg`, `.tag`, `.brass`, `.hex`. A local component class with the same name silently inherits the global rule (a `<span class="chev">▲</span>` in the admin composer picked up the global rotated-border triangle). Rename local ones. To override a global from a scoped block, qualify it (`.dossier-row .brassico`); root-level selectors need `:global([data-theme='dark']) .x` or svelte-check flags them unused.
- **A dark olive header band needs its text colours reset.** Screens that share `.qtitle`/`.qsub`-style classes between a light card and the band will render cream-on-cream — move both headers onto the band (quiz did this for its review header).

---

*Last synced after FIELD DOSSIER turn 3 — complete (3a–3g applied). Prompts
00–16 done + tour, motion,
profile-hub/native-gestures, CA manual-ingest + Monthly CA, gamified Test Centre
+ in-test guard, leaderboard rank + featured badges + modal polish, Base Camp v2,
Field Dossier visual system; next = Prompt 17). When you finish a prompt or a
standalone feature, update §2, the repo map, and any changed convention here —
and the matching row in docs/API.md / pb/SCHEMA.md — in the same commit.*
