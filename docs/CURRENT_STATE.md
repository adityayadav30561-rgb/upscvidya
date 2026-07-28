# Current State

> Session memory. Rewrite this at the end of every session. Keep <500 words.
> Read this FIRST on a new session (see CLAUDE.md §0). Don't scan the repo.

## Current goal

**Get to a handable beta.** Prompts 00–16 are built; the gap is config, hosting
and content. Checklist + step order: **[BETA_SETUP.md](BETA_SETUP.md)**.
**Prompt 17 (deploy/QA) stays paused** — there is no production to harden.

## Completed

- Prompts 00–16 + FIELD DOSSIER + retrieval practice. See CLAUDE.md §2.
- **AI is solved — 5-provider failover chain** (OpenRouter → Gemini → Mistral →
  OpenCode Zen → Groq). All keys live in `.env` (gitignored). Same chain in
  `scripts/ingest/ai.js` (replaces `groq.js`), the CA pipeline and `ca_extra.pb.js`.
  `AI_PROVIDER=<name>` pins one. Failover proven live by breaking keys.
- **POL-01 Historical Background authored** — 2,571-word teaching chapter
  (1 predict / 5 cloze / 1 recall) + **50 MCQs** (floor is 35). Synced and
  promoted to live in **dev only**; repo still says `draft`.
- **Quiz length uncapped** — `/api/quiz/start` serves the whole live pool
  (was a fixed 12). UI shows the real count via `live_questions`.
- **Reader paginates horizontally** (page-turn, swipe/mouse/keys). No vertical
  scroll. Verified in Chrome DevTools MCP at 412×915.

## In progress

Nothing half-done. Next chapter is the natural continuation.

## Next

1. **Chapter 2+ content** — the real bottleneck: 4 of 103 units authored.
   Author to CONTENT_AUTHORING.md, then `pnpm validate && pnpm sync -- --env dev`.
2. **Build a `draft-mcqs` CLI** (notes → draft MCQs). `pnpm ingest` only parses
   MCQ text you already have; there is no notes→MCQ path. Biggest lever.
3. **Make `mcq_floor` enforced** — validate.js only checks it is a number, never
   compares it to the actual count.
4. BETA_SETUP step 1 (Google OAuth, blocked on user), then steps 2/5/7/9.

## Active files

- `content/polity/POL-01-historical-background/` (new)
- `scripts/ingest/ai.js` (new, replaces `groq.js`)
- `pb/pb_migrations/1754100000_*.js`, `1754200000_*.js` (new — `live_questions`)
- `src/routes/(app)/topic/[code]/+page.svelte` + `+page.ts` (paged reader)
- `pb/pb_hooks/quiz.pb.js` (uncapped N), `src/lib/quiz.ts` (`quizCount`)

## Do NOT

- Display `mcq_floor` as a question count — it is an authoring target. Use
  `live_questions`.
- Re-cap quiz length. `N = pool.length` is deliberate.
- Assume prod exists. Everything is localhost (PB 8090 + dev 5173).
- Commit `.env` — it holds 5 live API keys.
- Give retrieval prompts XP or a server endpoint.
- Scan the repo (use PROJECT_INDEX.md).

## Notes / gotchas

- Dev login `reader-test@local.dev` / `Testpass123!` — delete before beta.
- PB must be **restarted** to load changed `pb_hooks` or new migrations.
- In the paged reader a monolithic block (`overflow:auto`, `break-inside:avoid`)
  can strand a heading on a blank page. A dev-only console warning flags any
  page <45% full.
- Scoped styles: a later same-specificity rule wins. Verify the **computed**
  style, not the source.
