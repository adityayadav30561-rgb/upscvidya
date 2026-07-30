# Current State

> Session memory. Rewrite this at the end of every session. Keep <500 words.
> Read this FIRST on a new session (see CLAUDE.md §0). Don't scan the repo.

## Current goal

**Get to a handable beta.** Prompts 00–16 are built; the gap is config, hosting
and content. Checklist + step order: **[BETA_SETUP.md](BETA_SETUP.md)**.
**Prompt 17 (deploy/QA) stays paused** — there is no production to harden.

## Completed

- Prompts 00–16 + FIELD DOSSIER + retrieval practice. See CLAUDE.md §2.
- **8 of 103 units authored**: POL-01…POL-06, POL-10, POL-19. Each is a full
  teaching chapter + MCQ bank, `draft` in the repo, synced and promoted to
  **live in dev only**.
- **POL-06 Union and Its Territory (this session)** — ~2,400 words, 28 reader
  pages (no near-empty-page warning), 5 tables ≤3 columns, 8 clozes + 1 predict
  + 1 recall, **100 MCQs**. Laxmikanth's Tables 6.1–6.4 were condensed to what
  UPSC asks (counts, the 8 UTs, the 12 named Acts), not reproduced whole.
  Verified in-browser at 412px: reader, quiz CTA reads `100 QUESTIONS` (from
  `live_questions`), `/quiz/POL-06` starts 1/100 with shuffled options.
- **Tier calibration is now a written rule.** POL-06 first landed at
  13/37/34/15/1 vs the house shape ~5/20/40/25/7 and was re-tiered (55 changes).
  Target table + audit one-liner: `docs/CONTENT_AUTHORING.md` §6; the reasoning
  is in DECISIONS.md → Content.
- **Authoring is Opus 5, not the API chain** (DECISIONS.md → "Who authors
  chapters"). The chain serves **current affairs + `pnpm ingest` only**.

## In progress

Nothing half-done.

## Next

1. **Chapter POL-07 (Citizenship, mcq_floor 30) onwards** — the bottleneck.
   Paste the raw chapter, author to CONTENT_AUTHORING.md, then
   `pnpm validate && pnpm sync -- --env dev`, promote, verify in the browser.
2. **Make `mcq_floor` enforced** — validate.js only checks it is a number.
3. BETA_SETUP step 1 (Google OAuth, blocked on user), then steps 2/5/7/9.

## Active files

- `content/polity/POL-06-union-and-its-territory/` (new, 100 MCQs)
- `docs/CONTENT_AUTHORING.md` (new §6 — tier + answer-position audit)

## Do NOT

- Use the AI API chain to write notes or MCQs. Decided and recorded.
- Ship an MCQ bank without auditing tier + answer-position spread (§6).
- Display `mcq_floor` as a question count — use `live_questions`.
- Re-cap quiz length. `N = pool.length` is deliberate.
- Assume prod exists. Everything is localhost (PB 8090 + dev 5173/5174).
- Commit `.env` — it holds 5 live API keys.
- Scan the repo (use PROJECT_INDEX.md).

## Notes / gotchas

- Dev login `reader-test@local.dev` / `Testpass123!` — delete before beta.
- Promoting a chapter to live in dev has **no script** — it is a throwaway PB
  superuser PATCH on `topics.status` + each question's `status`. Sync never
  downgrades status, so re-syncing an edit keeps them live.
- PB must be **restarted** to load changed `pb_hooks` or new migrations.
- **Keep `:::cloze` blocks to 2–3 short lines.** A tall one jumps to the next
  page and strands a blank one; `pnpm dev` warns for any page under 45% full.
- Statement-based and assertion-reason MCQs have a **fixed option order** —
  never reorder those when balancing answer positions.
