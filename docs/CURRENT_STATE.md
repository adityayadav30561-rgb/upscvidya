# Current State

> Session memory. Rewrite this at the end of every session. Keep <500 words.
> Read this FIRST on a new session (see CLAUDE.md §0). Don't scan the repo.

## Current goal

Polish the FIELD DOSSIER redesign across all built screens until
production-ready. **Prompt 17 (deploy/QA) is intentionally paused** — do not start it.

## Completed

- Prompts 00–16 (see CLAUDE.md §2). FIELD DOSSIER turn 3 complete (3a–3g),
  2a map, 4a base, Test Centre, Profile, admin queue.
- **This session — 4b (in-quiz reward beat), built + verified live:**
  on a correct answer the fired belt segment lights (`.dot.lit` + glow), a
  raised olive **TARGET HIT** card pops in (✓ disc · correct-option line ·
  brass `×N STREAK` stamp · dashed `WHY` note), `+N XP` flies off the top edge
  (`xpFly`), three `+N` sparks rise behind a rust `NEXT QUESTION →` (`sparkUp`).
  XP face value = `answerXp(tier)` from the client mirror (server anti-farm can
  still zero it; the finish summary stays the truth). Streak = consecutive
  correct run inside the attempt. All motion off under `prefers-reduced-motion`.
- **4c insignia fix:** the promotion plate now mounts the real
  `RankInsignia` for that grade (`width={86}`, `chevRise`) instead of a generic
  chevron stack. Verified at Sr. Constable and Director General.
- **`/dev/kitchen-sink`** gained a *Reward moments (4c / 4d)* section — four
  promote buttons + territory-captured, so ceremonies replay without earning XP.
- 4b/4c/4d all seen firing in a real quiz run. `pnpm check`: 522 files, 0/0.

## In progress

Nothing mid-edit. Working tree modified (4 files), uncommitted.

## Next (one per session, frugal — code only, no browser/test unless asked)

**4c / 4d spec pass** — both fire correctly; gaps seen on screen:

- **4c `RankUp.svelte`**: panel not full-bleed (canvas strip at the right edge);
  rank names render title-case, mockup is stencil UPPERCASE; the
  `SHARE TO BATTALION` line under the button is missing.
- **4d `TerritoryCaptured.svelte`**: `SECTOR PROGRESS` track + `n / 14 HELD`
  row missing from the stat card; the `+XP` chip collides with the `… TAKEN`
  headline instead of floating above it (mockup `right:12px; top:-32px`);
  eyebrow should read `<SECTOR> · FRONT LINE ADVANCED`.

Handoff spec lines: `4c` L213 · `4d` L266 of the handoff HTML. Read only those.

## Active files

- `src/lib/components/RankUp.svelte` (4c) · `TerritoryCaptured.svelte` (4d)
- `src/routes/dev/kitchen-sink/+page.svelte` (ceremony replay harness)
- `src/lib/styles/dossier.css` (shared keyframes, bottom)
- Done: `src/routes/(app)/quiz/[code]/+page.svelte` (4b)
- Handoff: `Army game app redesign directions/Force Prep - Gamified Directions.dc.html`
  — grep `id="4c"`, read only that block. Never the whole file.

## Do NOT (this feature)

- Start Prompt 17 / 18.
- Modify PocketBase schema or hooks — ceremonies only *display* what the finish
  endpoint returns.
- Duplicate ceremony keyframes per component — they live in `dossier.css`.
- Scan the repository — use PROJECT_INDEX.md.
- Browser/test-verify unless the user asks.
- Invent UI with no data behind it.

## Notes / gotchas

- **Local class names collide with `dossier.css` globals** — `.chev`, `.tab`,
  `.plate`, `.seg`, `.tag`, `.brass`, `.hex`, `.track`/`.fill` — *and* with each
  other inside one file: the belt dot's `.hit` picked up the `.hit` card styles
  (renamed `.lit`), and RankUp's local `.chev` was inheriting the global one.
- Dev data moved during the demo run: local user is **Sr. Constable, 1,200 XP**,
  POL-05 + POL-10 conquered 12/12. **POL-19 is still unconquered** — use it to
  replay 4b/4d live.
- Browser-driving the quiz: the sticky `.qfoot` button sits *under* the fixed
  bottom nav, so coordinate clicks land on the nav — click through the DOM
  (`document.querySelector('.qfoot .btn').click()`) or scroll to the bottom.
- `BadgeIcon` has an `engraved` prop for empty medal sockets.
- Svelte scoping: qualify to beat a global (`.dossier-row .brassico`); wrap
  root-level selectors as `:global([data-theme='dark']) .x`.
- Restyling to `.plate`? Delete the old `background/border/box-shadow` first.
- Dev: PB `pb/pocketbase.exe serve --http=127.0.0.1:8090` + `pnpm dev` (5173).
- Rank ladder = 14 grades, mirrored `src/lib/ranks.ts` ↔ `pb/pb_hooks/lib/xp.js`.
