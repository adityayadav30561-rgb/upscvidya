# Current State

> Session memory. Rewrite this at the end of every session. Keep <500 words.
> Read this FIRST on a new session (see CLAUDE.md §0). Don't scan the repo.

## Current goal

**Get to a handable beta.** Prompts 00–16 are built; the gap is config, hosting
and content. Checklist + step order: **[BETA_SETUP.md](BETA_SETUP.md)**.
**Prompt 17 (deploy/QA) stays paused** — there is no production to harden.

## Completed

- Prompts 00–16 + FIELD DOSSIER + retrieval practice. See CLAUDE.md §2.
- **Chapters POL-02, POL-03, POL-04 authored; POL-05 rewritten** (was a
  721-word stub). Each: full teaching chapter + MCQ bank, `draft` in the repo,
  synced and promoted to **live in dev only**.
- **Authoring is Opus 5, not the API chain** — a `draft-chapter` CLI was built,
  run on POL-05 and **deleted**. Its MCQs passed; its notes failed (broken
  tables, triple-taught topics, half the required clozes). Full reasoning in
  DECISIONS.md → "Who authors chapters". `scripts/ingest/ai.js` reverted; the
  chain now serves **current affairs + `pnpm ingest` only**.
- Fixed 2 reader pagination bugs found in-browser (POL-03 p8, POL-05 p21): a
  cloze card cannot fragment, so an over-long one strands a half-empty page.
- Retired 7 dev-seed rows (`CAPF-2023-Q001`, `CA-TEST-1`, …) mislinked to the
  POL-05 topic — they were being served inside Preamble quizzes.

## In progress

Nothing half-done.

## Next

1. **Chapter POL-06 onwards** — the bottleneck: 7 of 103 units authored.
   Paste the raw chapter, author to CONTENT_AUTHORING.md, then
   `pnpm validate && pnpm sync -- --env dev`, promote, verify in the browser.
2. **Make `mcq_floor` enforced** — validate.js only checks it is a number.
3. BETA_SETUP step 1 (Google OAuth, blocked on user), then steps 2/5/7/9.

## Active files

- `content/polity/POL-02-making-of-the-constitution/` (new, 70 MCQs)
- `content/polity/POL-03-concept-of-the-constitution/` (new, 45)
- `content/polity/POL-04-salient-features/` (new, 70)
- `content/polity/POL-05-preamble/` (rewritten, 50)

## Do NOT

- Use the AI API chain to write notes or MCQs. Decided and recorded.
- Display `mcq_floor` as a question count — use `live_questions`.
- Re-cap quiz length. `N = pool.length` is deliberate.
- Assume prod exists. Everything is localhost (PB 8090 + dev 5173).
- Commit `.env` — it holds 5 live API keys.
- Scan the repo (use PROJECT_INDEX.md).

## Notes / gotchas

- Dev login `reader-test@local.dev` / `Testpass123!` — delete before beta.
- PB must be **restarted** to load changed `pb_hooks` or new migrations.
- **Keep `:::cloze` blocks to 2–3 short lines.** They render as one
  unbreakable card; a tall one jumps to the next page and strands a blank one.
  `pnpm dev` warns in the console for any page under 45% full — check it after
  every chapter.
- Balance MCQ answer positions after authoring (statement-based and
  assertion-reason have a fixed option order — never reorder those).
- Piping a long background command through `tail` buffers the log; you see
  nothing until it exits.
