# Current State

> Session memory. Rewrite this at the end of every session. Keep <500 words.
> Read this FIRST on a new session (see CLAUDE.md §0). Don't scan the repo.

## Current goal

Polish the FIELD DOSSIER redesign across all built screens until
production-ready. **Prompt 17 (deploy/QA) is intentionally paused** — do not start it.

## Completed

- Prompts 00–16 (see CLAUDE.md §2). FIELD DOSSIER turn 3 (3a–3g), 2a map,
  4a base, 4b in-quiz reward beat, Test Centre, Profile, admin queue.
- **This session — 4c / 4d spec pass, all six gaps closed:**
  - **4c `RankUp.svelte`**: full-bleed fixed — the strip of canvas down the right
    edge was the *document scrollbar* (a `fixed; inset:0` overlay covers the
    client area only), so the ceremony now locks `document.body.style.overflow`
    in an `$effect` and restores it on destroy. Rank names render stencil
    UPPERCASE (`text-transform` on `.from`/`.to`; `RANKS[].label` untouched).
    Added the `SHARE TO BATTALION` line under the button — a real button:
    `navigator.share` if present, else clipboard, label flipping to
    `COPIED TO CLIPBOARD` / `SHARING UNAVAILABLE` for 2.4s; `AbortError`
    (user dismissed the sheet) is swallowed. `rise .5s .75s`.
  - **4d**: the component already had the sector block, kicker and `.xp-fly` —
    **the callers never passed `sector`**. Quiz results now derives it:
    `sectorChapters` (chapters only — drills aren't territory), and
    `loadSectorHeld()` counts held chapters *after* `finishQuiz` returns (so the
    topic just taken counts), via the map loader's two reads trimmed with
    `fields` (`id,id_code` / `topic,state`). Failure ⇒ `sectorHeld` stays null
    and the bar just doesn't render — no invented numbers. Kitchen sink passes
    the mockup's `{ name:'Foundations', held:1, total:14 }`.
    Spec deltas: `.xp-fly` `top:-32px`, kicker `.28em`, `.taken` 36px.
- `pnpm check`: 522 files, 0 errors, 0 warnings. Committed + pushed.

## In progress

Nothing. Working tree clean.

## Next (one per session, frugal — code only, no browser/test unless asked)

No queued design gap. Options, pick one:

- **Live-verify 4c/4d** in a real quiz run (POL-19 is still unconquered) — the
  spec pass was type-checked only, never seen on screen.
- **Screens still un-restyled** to Field Dossier: revision stack, PYQ vault,
  onboarding/path, checkout. Audit one, restyle it.
- Or resume Prompt 17 when the user unpauses it.

## Active files

- `src/lib/components/RankUp.svelte` (4c) · `TerritoryCaptured.svelte` (4d)
- `src/routes/(app)/quiz/[code]/+page.svelte` (4b + sector wiring)
- `src/routes/dev/kitchen-sink/+page.svelte` (ceremony replay harness)
- `src/lib/styles/dossier.css` (shared keyframes, bottom)
- Handoff: `Army game app redesign directions/Force Prep - Gamified Directions.dc.html`
  — grep `id="4c"` (L213) / `id="4d"` (L266), read only that block. Never the whole file.

## Do NOT

- Start Prompt 17 / 18.
- Modify PocketBase schema or hooks — ceremonies only *display* server output.
- Duplicate ceremony keyframes per component — they live in `dossier.css`.
- Scan the repository — use PROJECT_INDEX.md.
- Browser/test-verify unless the user asks.
- Invent UI with no data behind it.

## Notes / gotchas

- **Local class names collide with `dossier.css` globals** — `.chev`, `.tab`,
  `.plate`, `.seg`, `.tag`, `.brass`, `.hex`, `.track`/`.fill` — *and* with each
  other inside one file (the belt dot's `.hit` picked up the `.hit` card styles;
  renamed `.lit`).
- Dev data: local user is **Sr. Constable, 1,200 XP**, POL-05 + POL-10 conquered
  12/12. **POL-19 is still unconquered** — use it to replay 4b/4d live.
- Browser-driving the quiz: the sticky `.qfoot` button sits *under* the fixed
  bottom nav — click through the DOM (`document.querySelector('.qfoot .btn').click()`).
- `BadgeIcon` has an `engraved` prop for empty medal sockets.
- Svelte scoping: qualify to beat a global (`.dossier-row .brassico`); wrap
  root-level selectors as `:global([data-theme='dark']) .x`.
- Restyling to `.plate`? Delete the old `background/border/box-shadow` first.
- Dev: PB `pb/pocketbase.exe serve --http=127.0.0.1:8090` + `pnpm dev` (5173).
- Rank ladder = 14 grades, mirrored `src/lib/ranks.ts` ↔ `pb/pb_hooks/lib/xp.js`.
