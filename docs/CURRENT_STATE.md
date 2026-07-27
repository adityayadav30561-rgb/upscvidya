# Current State

> Session memory. Rewrite this at the end of every session. Keep <500 words.
> Read this FIRST on a new session (see CLAUDE.md §0). Don't scan the repo.

## Current goal

Retention/retrieval features on top of the FIELD DOSSIER redesign.
**Prompt 17 (deploy/QA) stays paused** — do not start it.

## Completed

- Prompts 00–16 + FIELD DOSSIER turns 3/4 + retrieval practice (see CLAUDE.md §2).
- **This session:**
  1. **Content unblocked + synced.** `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` now
     live in `.env` (gitignored); `pnpm sync` runs `node --env-file-if-exists=.env`
     so it reads them itself. POL-05's retrieval prompts are in local PB
     (`notes_md`, status live) — the reader shows them.
  2. **sync.js bug fixed.** Unit filter was `u.folderIdCode`, which drops
     `content/pyq/CAPF-20xx` (PYQ folders have no id_code) → the retire sweep
     marked all 11 PYQ questions `retired`. Filter now keeps `subject === 'pyq'`.
     Local PB repaired (statuses PATCHed back to `live`); sync is idempotent again.
     ⚠️ **Prod may already be damaged** — CI syncs on push to `main`, so check
     prod `questions` where `source_type = "pyq"` for `status = retired`.
  3. **Weak-fact labels fixed.** `factLabel(block, values)` + `clipLabel()` moved
     into `markdown.ts` (pure, unit-tested). Predict/recall now store the ANSWER
     (first sentence of the answer HTML, prompt only as fallback), not the
     question. Clip is word-boundary at 88 chars and peels back trailing
     articles/prepositions/bare numerals (`…commenced on 26…` → `…commenced…`).
  4. **Pre-flight stamp is per block id** (`{'cloze-3': t}`), not one chapter
     timestamp — a miss written in the same millisecond as the stamp was being
     swallowed (flaky test, now deterministic). Legacy numeric stamps still read.
- `pnpm check` 525 / 0 · `pnpm test` 213 pass · `pnpm build` clean · `pnpm validate` ok.
- Browser-verified end to end on POL-05: predict/cloze/recall render, cloze
  grading (brass/red), labels in localStorage, pre-flight card, stamp suppresses
  the brief on the next fresh run.

## In progress

Nothing.

## Next

- **Content pass:** author retrieval prompts + real notes per chapter. Rule of
  thumb: 1 predict after the intro, 1 cloze per ~300 words, 1 recall before the
  quiz CTA. Then `pnpm validate && pnpm sync -- --env dev`.
- Check/repair prod PYQ statuses (see above) before the next `main` push lands.
- Optional later: durable weak facts (device-local today), Ustad tour step on the
  reader, restyle PYQ vault / onboarding / checkout.

## Active files

- `src/lib/markdown.ts` (renderBlocks, cloze matching, `factLabel`/`clipLabel`)
- `src/lib/components/RecallBlock.svelte` · `src/lib/reader.svelte.ts` (marks, stamp)
- `src/routes/(app)/topic/[code]/+page.svelte` · `quiz/[code]/+page.svelte`
- `scripts/content/sync.js` · `package.json` (sync script) · `.env`
- Tests: `src/lib/__tests__/markdown-blocks.test.ts`, `recall-store.test.ts`

## Do NOT

- Start Prompt 17 / 18.
- Give retrieval prompts XP or a server endpoint — client-reported = farmable.
- Re-add `renderNotes()` to the reader; it renders `blocks`, not one string.
- Let sync hard-delete or downgrade status; never drop non-`folderIdCode` units.
- Scan the repo (use PROJECT_INDEX.md) or browser-verify unless asked.

## Notes / gotchas

- Dev leftovers: POL-05 has one open quiz session (at pre-flight); POL-10 and
  POL-19 sessions still open → pre-flight skips a chapter until its run ends.
- Local class names collide with `dossier.css` globals (`.chev .tab .plate .seg
  .tag .brass .hex .track/.fill`) — rename or qualify.
- Svelte 5: reading a prop inside `$state(...)` warns — derive it instead.
- Dev: PB `pb/pocketbase.exe serve --http=127.0.0.1:8090` + `pnpm dev` (5173).
