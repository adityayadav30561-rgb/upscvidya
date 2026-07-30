# Current State

> Session memory. Rewrite this at the end of every session. Keep <500 words.
> Read this FIRST on a new session (see CLAUDE.md §0). Don't scan the repo.

## Current goal

**Make the app installable on a phone.** Content authoring is **paused** until a
stranger can open a URL, tap *Add to Home Screen*, and log in. Checklist and step
order: **[BETA_SETUP.md](BETA_SETUP.md)** — critical path is 1 → 2 → 2b → 5 → 7 → 9.
**Prompt 17 (deploy/QA) stays paused** — that hardens a production that does not
exist yet; this goal creates it.

## Completed

- Prompts 00–16 + FIELD DOSSIER + retrieval practice. See CLAUDE.md §2.
- **8 of 103 units authored**: POL-01…POL-06, POL-10, POL-19. Each is a full
  teaching chapter + MCQ bank, `draft` in the repo, synced and promoted to
  **live in dev only**.
- **POL-06 Union and Its Territory (last session)** — ~2,400 words, 28 reader
  pages, 5 tables ≤3 columns, 8 clozes + 1 predict + 1 recall, **100 MCQs**.
  Browser-verified at 412px. Committed and pushed (`30b29e6`).
- **Tier calibration is now a written rule** — target ~5/20/40/25/7, audit the
  bank not just each question. `docs/CONTENT_AUTHORING.md` §6; reasoning in
  DECISIONS.md → Content.
- **BETA_SETUP.md restructured** — a missing **step 2b (Cloudflare Pages
  frontend deploy)** was added; without an HTTPS origin there is no service
  worker, no install prompt and no Google OAuth, so nothing was installable.

## In progress

Nothing half-done in code. Step 1 (Google OAuth config) is **blocked on the
user** — it is console work in Google Cloud + the PB admin panel, no app code.

## Next

1. **Step 1** — Google Cloud OAuth client + PB `users` OAuth2 config.
2. **Step 2** — PocketHost instance; upload `pb_migrations/` + `pb_hooks/`,
   re-do the Google config there, `pnpm sync -- --env prod`.
3. **Step 2b** — Cloudflare Pages; set every `PUBLIC_*` var or the build fails.
4. **Step 5 / 7 / 9** — beta-free system, privacy + terms pages, install guide.
5. Only then **POL-07 (Citizenship, `mcq_floor` 30)** and the rest of the 103.

## Active files

- `docs/BETA_SETUP.md` (new step 2b, critical path marked)
- `content/polity/POL-06-union-and-its-territory/` (shipped last session)

## Do NOT

- Author chapters until the app is installable. Explicit user call.
- Use the AI API chain to write notes or MCQs. Decided and recorded.
- Ship an MCQ bank without auditing tier + answer-position spread (§6).
- Put a server secret in a `PUBLIC_*` var — that bundle is public.
- Display `mcq_floor` as a question count — use `live_questions`.
- Commit `.env` — it holds 5 live API keys.
- Scan the repo (use PROJECT_INDEX.md).

## Notes / gotchas

- Pushing to `main` fires a CI action that syncs content to **prod**. No prod
  exists yet, so that step fails/no-ops — expected until step 2 lands.
- **No "new version" toast** exists; an open tab keeps stale JS after a deploy.
- `pnpm build` has never run against a real `PUBLIC_PB_URL` — try it locally
  before trusting the Pages build.
- Dev login `reader-test@local.dev` / `Testpass123!` — delete before beta.
- Promoting a chapter to live in dev has **no script** — throwaway PB superuser
  PATCH on `topics.status` + each question's `status`.
- PB must be **restarted** to load changed `pb_hooks` or new migrations.
