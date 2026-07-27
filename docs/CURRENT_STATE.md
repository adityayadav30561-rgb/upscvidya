# Current State

> Session memory. Rewrite this at the end of every session. Keep <500 words.
> Read this FIRST on a new session (see CLAUDE.md §0). Don't scan the repo.

## Current goal

Retention/retrieval features on top of the FIELD DOSSIER redesign.
**Prompt 17 (deploy/QA) stays paused** — do not start it.

## Completed

- Prompts 00–16 + FIELD DOSSIER turns 3/4 (see CLAUDE.md §2).
- **This session, 3 units:**
  1. **Revision screens → FIELD DOSSIER** (`revision/+page.svelte`, logic
     untouched): stack home = olive dispatch band + brass card-stack count,
     `.dossier-row` decay warnings, recessed week rail w/ brass TODAY, olive
     dashed STACK CLEAR stamp for the empty state; review player = olive command
     band + ammo-belt `.segbar` (`.track` above 20 cards), `.plate` card,
     `.recess` answer fold, grade keys Again(red)/Good(quiet)/Mastered(olive).
  2. **In-chapter retrieval practice** (new module). Authors write `:::predict`
     / `:::cloze` / `:::recall` blocks in `topic.md`; `renderBlocks()` returns a
     **block list** (prose HTML + prompt objects) because a Svelte component
     cannot mount inside `{@html}`. `RecallBlock.svelte` renders them: predict
     flap, cloze sockets (brass=correct, red=miss, `|` = alternatives, forgiving
     normalisation), free-recall scratch + model answer, self-mark. Ungraded,
     **no server call, no XP**. `validate.js` rejects malformed blocks.
     Reference prompts authored into POL-05.
  3. **Weak facts + explainer.** Marks now store `{m,l,t}` — the label is the
     filled sentence, not the block id (`cloze-2` prints nothing). Quiz gained a
     `brief` phase: "BEFORE YOU BEGIN — you struggled with these while reading",
     fresh runs only (skipped on `?s=` resume or `current > 0`), stamped on
     begin so retakes don't nag. First slip per device shows a one-time
     explainer ("try before you reveal · never affects XP").
- `pnpm check` 525 files / 0 errors · `pnpm test` 204 pass · `pnpm validate` ok.
- Browser-verified: kitchen sink slips, cloze miss/hit, pre-flight on POL-10.

## In progress

Nothing. All three units complete.

## Next

- **Content pass** (user's stated next step): author retrieval prompts +
  real notes per chapter. Rule of thumb: 1 predict after the intro, 1 cloze per
  ~300 words, 1 recall before the quiz CTA.
- Blocked demo: `pnpm sync -- --env dev` needs `PB_ADMIN_EMAIL` /
  `PB_ADMIN_PASSWORD` (absent from `.env`), so POL-05's new prompts are not in
  local PB yet — the reader can't show them until synced.
- Optional later: durable weak facts (device-local today), Ustad tour step on
  the reader, restyle PYQ vault / onboarding / checkout.

## Active files

- `src/lib/markdown.ts` (renderBlocks, cloze matching) ·
  `src/lib/components/RecallBlock.svelte` · `src/lib/reader.svelte.ts` (marks)
- `src/routes/(app)/topic/[code]/+page.svelte` (block loop) ·
  `src/routes/(app)/quiz/[code]/+page.svelte` (`brief` phase) ·
  `src/routes/(app)/revision/+page.svelte`
- `scripts/content/validate.js` · `content/polity/POL-05-preamble/topic.md`
- Tests: `src/lib/__tests__/markdown-blocks.test.ts`, `recall-store.test.ts`

## Do NOT

- Start Prompt 17 / 18.
- Give retrieval prompts XP or a server endpoint — client-reported = farmable.
- Re-add `renderNotes()` to the reader; it renders `blocks`, not one string.
- Duplicate ceremony keyframes per component — they live in `dossier.css`.
- Scan the repo (use PROJECT_INDEX.md) or browser-verify unless asked.

## Notes / gotchas

- Dev leftovers: an **open POL-10 quiz session** (started during the demo);
  POL-05 2/12 and POL-19 4/12 sessions also in progress → pre-flight will skip
  those chapters until they finish.
- Local class names collide with `dossier.css` globals (`.chev .tab .plate .seg
  .tag .brass .hex .track/.fill`) — rename or qualify.
- Restyling to `.plate`? Delete the old `background/border/box-shadow` first.
- Svelte 5: reading a prop inside `$state(...)` warns — derive it instead
  (`const mark = $derived(markOverride ?? loadRecall(code, block.id))`).
- Dev: PB `pb/pocketbase.exe serve --http=127.0.0.1:8090` + `pnpm dev` (5173).
