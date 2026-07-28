# Current State

> Session memory. Rewrite this at the end of every session. Keep <500 words.
> Read this FIRST on a new session (see CLAUDE.md §0). Don't scan the repo.

## Current goal

Retention/retrieval features on top of the FIELD DOSSIER redesign.
**Prompt 17 (deploy/QA) stays paused** — do not start it.

## Completed

- Prompts 00–16 + FIELD DOSSIER turns 3/4 + in-chapter retrieval practice
  (predict / cloze / recall, weak-fact labels, per-block pre-flight stamp).
  See CLAUDE.md §2.
- **This session (tooling only — no app code touched):** moved development from
  the Claude Code desktop app to the **VS Code extension**, which has no
  `preview_start` browser tool. Replaced it with **Chrome DevTools MCP**:
  [.mcp.json](../.mcp.json) declares a project-scoped `chrome-devtools` server
  (`cmd /c npx -y chrome-devtools-mcp@latest --isolated`). Connected and proven
  — drove real Chrome to `/login`, screenshot correct.
- `pnpm check` 525 files / 0 errors / 0 warnings (unchanged; no code edited).

## In progress

Nothing.

## Next

- **Content pass:** author retrieval prompts + real notes per chapter. Rule of
  thumb: 1 predict after the intro, 1 cloze per ~300 words, 1 recall before the
  quiz CTA. Then `pnpm validate && pnpm sync -- --env dev`.
- Check/repair prod PYQ statuses — the old `sync.js` unit-filter bug retired
  every `source_type="pyq"` question and CI syncs on push to `main`. Sync never
  downgrades status, so it does not self-heal. Verify before the next push.
- Optional later: durable weak facts (device-local today), Ustad tour step on the
  reader, restyle PYQ vault / onboarding / checkout.

## Active files

- `.mcp.json` (new) · `CLAUDE.md` §8 (browser-verify note)
- Feature files unchanged from last session: `src/lib/markdown.ts`,
  `src/lib/components/RecallBlock.svelte`, `src/lib/reader.svelte.ts`,
  `src/routes/(app)/topic/[code]/+page.svelte`, `quiz/[code]/+page.svelte`,
  `scripts/content/sync.js`
- Tests: `src/lib/__tests__/markdown-blocks.test.ts`, `recall-store.test.ts`

## Do NOT

- Start Prompt 17 / 18.
- Give retrieval prompts XP or a server endpoint — client-reported = farmable.
- Re-add `renderNotes()` to the reader; it renders `blocks`, not one string.
- Let sync hard-delete or downgrade status; never drop non-`folderIdCode` units.
- Scan the repo (use PROJECT_INDEX.md) or browser-verify unless asked.

## Notes / gotchas

- **Browser verify:** start PB (`pb/pocketbase.exe serve --http=127.0.0.1:8090`)
  + `pnpm dev` (5173), then the `mcp__chrome-devtools__*` tools. Pass
  `initScript` setting `localStorage['tour-seen']='1'` or the Ustad tour
  navigates you off the route under test. `--isolated` = fresh profile, so
  `(app)` routes need a fresh login each run. `resize_page` sizes the window,
  not the viewport — use `emulate` for true mobile metrics.
- Dev leftovers: POL-05 has one open quiz session (at pre-flight); POL-10 and
  POL-19 sessions still open → pre-flight skips a chapter until its run ends.
- Local class names collide with `dossier.css` globals (`.chev .tab .plate .seg
  .tag .brass .hex .track/.fill`) — rename or qualify.
- Svelte 5: reading a prop inside `$state(...)` warns — derive it instead.
