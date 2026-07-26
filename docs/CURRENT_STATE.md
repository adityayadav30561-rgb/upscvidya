# Current State

> Session memory. Rewrite this at the end of every session. Keep <500 words.
> Read this FIRST on a new session (see CLAUDE.md §0). Don't scan the repo.

## Current goal

Polish the FIELD DOSSIER redesign across all built screens until
production-ready. **Prompt 17 (deploy/QA) is intentionally paused** — do not start it.

## Current feature

**FIELD DOSSIER redesign — porting remaining screens (turn 3).**

## Completed

- Prompts 00–16 (see CLAUDE.md §2 for the full table).
- FIELD DOSSIER system: `tokens.css` v4 + `dossier.css` utilities.
- Restyled earlier: Base (4a), Test Centre mock cards, Profile, Map (2a),
  Reader (3a), FIELD NOTE callouts, ceremonies (RankUp 4c, TerritoryCaptured 4d).
- **This session:** 3b quiz · 3c drill composer · 3d empty record · 3e briefing.
  Plus the admin validation queue (not part of turn 3 — restyled anyway).
- `pnpm check` clean: 522 files, 0 errors, 0 warnings.

## In progress

Nothing mid-edit. Uncommitted working tree (nothing committed this session).

## Next (one per session, frugal — code only, no browser/test unless asked)

**3f rank ladder** then **3g decorations.** Each = restyle chrome to FIELD
DOSSIER, keep all logic. Read the handoff section first (see below) — the
screen names in this file are not enough, the mockups have specific furniture.

- **4b NOT built** (in-quiz "XP chip flies off ammo belt + streak stamp"
  micro-animation). Build only if the user asks.

## Active files

- 3f: `src/routes/(app)/profile/ranks/+page.svelte`
- 3g: `src/routes/(app)/profile/decorations/+page.svelte`
- Handoff source: `Army game app redesign directions/Force Prep - Gamified Directions.dc.html`
  — grep it for `id="3f"` / `id="3g"` and read those ~60 lines. Do NOT read the
  whole file. The inline styles there are the spec.

## FIELD DOSSIER restyle pattern (reuse for 3f–3g)

Dark olive header `linear-gradient(#3d4429,#2c3120)` + hard bottom shadow +
cream `#f2ecd6` text · brass rail `linear-gradient(90deg,#b5883a,#f0cf82)` ·
raised cream sheets (`.plate`) · recessed slots (`var(--recess-in)`) for inputs,
statements, notes · rust CTAs pressing `translateY(2–3px)` · Big Shoulders
uppercase headings + Barlow Condensed stat chips. Compose from `dossier.css`
utilities — no ad-hoc gradients. Delete old `background/border/box-shadow`
before adding `.plate` or they fight.

## Do NOT (this feature)

- Start Prompt 17 (deploy/QA) or Prompt 18.
- Refactor unrelated modules or change architecture.
- Modify PocketBase schema / hooks (restyle = chrome only, keep logic).
- Scan the repository — use PROJECT_INDEX.md.
- Browser/test-verify unless the user explicitly asks.
- Touch more than one screen per turn.
- Invent UI the handoff shows but the app has no route for (e.g. the "Week in
  review" row in 3e was skipped — no route behind it).

## Notes / gotchas

- **Local class names can collide with `dossier.css` globals.** `.chev`, `.tab`,
  `.plate`, `.seg`, `.tag` are global. A local `<span class="chev">▲</span>` got
  the global rotated-border triangle. Rename local ones (`c-chev`).
- Svelte scoping: to beat a global rule, qualify it (`.dossier-row .brassico`),
  and wrap root-level selectors as `:global([data-theme='dark']) .x`.
- Dev: PB `pb/pocketbase.exe serve --http=127.0.0.1:8090` **must be running** or
  login/signup fail silently; app `pnpm dev` (5173). Local `pb_data` ≠ prod DB.
- Server is authority (XP/scores/answers). Client math mirrors server.
- Rank ladder = 14 grades, mirrored in `src/lib/ranks.ts` ↔ `pb/pb_hooks/lib/xp.js`.
