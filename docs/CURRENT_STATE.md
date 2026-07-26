# Current State

> Session memory. Rewrite this at the end of every session. Keep <500 words.
> Read this FIRST on a new session (see CLAUDE.md §0). Don't scan the repo.

## Current goal

Polish the FIELD DOSSIER redesign across all built screens until
production-ready. **Prompt 17 (deploy/QA) is intentionally paused** — do not start it.

## Completed

- Prompts 00–16 (see CLAUDE.md §2 for the full table).
- FIELD DOSSIER system: `tokens.css` v4 + `dossier.css` utilities.
- Turn 3 is **complete**: 3a reader · 3b quiz · 3c drill composer · 3d empty
  record · 3e briefing · **3f rank ladder** · **3g decorations**. Plus 2a map,
  4a base, Test Centre, Profile, admin queue.
- **This session:** 3f (brass summit plate, recessed future rungs, raised
  NEXT-UP rung, rust YOU-ARE-HERE card + XP track, "N XP TO PROMOTION" marker)
  and 3g (felt BATTALION BOARD with hero medal + 2×2 minis + dashed medal beds,
  brass rivet counters, EDIT BOARD pin-mode, struck/on-board/latest strip, one
  felt case per real badge category covering all 25 `BADGES` codes; unearned =
  engraved glyph in a recessed socket).
- `pnpm check` clean: 522 files, 0 errors, 0 warnings.

## In progress

Nothing mid-edit. **Working tree uncommitted** (turn 3 + 3f/3g).

## Next (one per session, frugal — code only, no browser/test unless asked)

**Reward moments 4b · 4c · 4d.**

- **4b = NOT built.** In-quiz reward beat: XP chip flies off the ammo belt +
  streak stamp on a correct answer. Build it into the quiz player; reuse
  `xpFly` / `sparkUp` / `stampIn` from the bottom of `dossier.css`. Gate on
  `prefers-reduced-motion`.
- **4c/4d already exist** as components (`RankUp.svelte`,
  `TerritoryCaptured.svelte`, shown after a passing topic quiz). This turn =
  re-read the handoff blocks and bring them up to spec / polish, not rebuild.

Handoff spec lines: `4a` L16 · **`4b` L174** · **`4c` L213** · **`4d` L266** of
the handoff HTML. Read only those blocks.

## Active files

- 4b: `src/routes/(app)/quiz/[code]/+page.svelte`, shared keyframes at the
  bottom of `src/lib/styles/dossier.css`
- 4c: `src/lib/components/RankUp.svelte`
- 4d: `src/lib/components/TerritoryCaptured.svelte`
- Showcase: `src/routes/dev/kitchen-sink/+page.svelte`
- Handoff source: `Army game app redesign directions/Force Prep - Gamified Directions.dc.html`
  — grep `id="4b"` etc., read only that block. Never the whole file.

## Do NOT (this feature)

- Start Prompt 17 (deploy/QA) or Prompt 18.
- Modify PocketBase schema / hooks — XP and conquest truth stays server-side;
  reward moments only *display* what the finish endpoint already returns.
- Duplicate ceremony keyframes per component — they live in `dossier.css`.
- Scan the repository — use PROJECT_INDEX.md.
- Browser/test-verify unless the user explicitly asks.
- Invent UI with no data behind it (3g's "closest decoration" card was skipped
  for exactly this reason — no per-badge progress exists client-side).

## Notes / gotchas

- `BadgeIcon` has an **`engraved`** prop (glyph only — no coin/ribbon/padlock)
  for empty medal sockets. Default behaviour unchanged.
- **Local class names collide with `dossier.css` globals** (`.chev`, `.tab`,
  `.plate`, `.seg`, `.tag`, `.brass`, `.hex`, `.track`/`.fill`). Prefix locals.
- Svelte scoping: qualify to beat a global (`.dossier-row .brassico`); wrap
  root-level selectors as `:global([data-theme='dark']) .x`.
- Restyling to `.plate`? Delete the old `background/border/box-shadow` first.
- Dev: PB `pb/pocketbase.exe serve --http=127.0.0.1:8090` must be running or
  login fails silently; app `pnpm dev` (5173).
- Rank ladder = 14 grades, mirrored `src/lib/ranks.ts` ↔ `pb/pb_hooks/lib/xp.js`.
