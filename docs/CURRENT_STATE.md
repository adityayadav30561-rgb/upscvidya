# Current State

> Session memory. Rewrite this at the end of every session. Keep <500 words.
> Read this FIRST on a new session (see CLAUDE.md §0). Don't scan the repo.

## Current goal

**Get to a handable beta.** Prompts 00–16 are built; the gap is config, hosting
and content, not features. Checklist + step order: **[BETA_SETUP.md](BETA_SETUP.md)**.
**Prompt 17 (deploy/QA) stays paused** — there is no production to harden.

## Completed

- Prompts 00–16 + FIELD DOSSIER turns 3/4 + in-chapter retrieval practice +
  Chrome DevTools MCP. See CLAUDE.md §2.
- **This session — content pass:** POL-05 / POL-10 / POL-19 rewritten from dev
  fixtures to real notes (~600–700 words each) with the prompt rule applied
  (1 predict / ~1 cloze per 300 words / 1 recall). `pnpm validate` ✓ ·
  `pnpm sync -- --env dev` → 3 topics updated, **0 retired**.
- **Authoring template frozen:** [CONTENT_AUTHORING.md](CONTENT_AUTHORING.md) —
  the fixed topic.md shape for all future content.
- **PYQ repair tool:** `scripts/content/repair-pyq-status.js` + `pnpm repair:pyq`
  (dry run unless `--apply`). Proven both ways on dev. **No prod exists, so
  nothing to repair** — parked.
- **Beta plan decided** (all recorded in DECISIONS.md): PWA via URL + install
  guide, APK later as a self-hosted TWA; beta on PocketHost + Cloudflare Pages
  (₹0, no domain); Oracle Always Free + bought domain at launch.
- **`.env.example` fixed:** shipped `PUBLIC_DEV_BYPASS_AUTH=true` with a stale
  comment — would have handed every visitor an authed session on a fresh
  deploy. Now `false`; added the content-CLI vars.
- `pnpm test` 213/213 · `pnpm check` 525 files / 0 errors / 0 warnings.

## In progress

**BETA_SETUP step 1 — Google login.** App code needs no change. Waiting on the
user to create the Google Cloud OAuth client and paste ID/secret into PB Admin
→ `users` → Options → OAuth2. Then verify the flow in a real browser.

## Next

1. Finish step 1, verify the Google popup → `/onboarding` path.
2. **Step 3 keys, Groq first** — `GROQ_API_KEY` unblocks `pnpm ingest`
   (notes → draft MCQs) and the CA pipeline. Then PostHog / OneSignal.
3. **Step 6 content** — the real bottleneck: 3 chapters of 103, each needing
   500–700 words + its `mcq_floor` of MCQs. Author to CONTENT_AUTHORING.md,
   then `pnpm validate && pnpm sync -- --env dev`.
4. Later: step 5 beta-free system, step 7 privacy/terms, step 8 feedback sheet.

## Active files

- `docs/BETA_SETUP.md` (new) · `docs/CONTENT_AUTHORING.md` (new)
- `scripts/content/repair-pyq-status.js` (new) · `package.json` (`repair:pyq`)
- `content/polity/POL-{05,10,19}-*/topic.md` · `.env.example`
- Docs: `DECISIONS.md`, `docs/API.md` §7, `docs/PROJECT_INDEX.md`, `CLAUDE.md` §8

## Do NOT

- Start Prompt 17 / 18 wholesale — take beta items from BETA_SETUP.md instead.
- Assume a production PB exists. Everything is localhost:
  `pb/pocketbase.exe serve` (8090) + `pnpm dev` (5173).
- Give retrieval prompts XP or a server endpoint — client-reported = farmable.
- Re-add `renderNotes()` to the reader; it renders `blocks`, not one string.
- Let sync hard-delete or downgrade status; never drop non-`folderIdCode` units.
- Put the Google client secret in `.env` or git — it lives in PB's database.
- Scan the repo (use PROJECT_INDEX.md) or browser-verify unless asked.

## Notes / gotchas

- `process.exit()` in a content CLI while fetch keep-alive sockets are open
  aborts Node on Windows (`UV_HANDLE_CLOSING`). Return from `main()` instead.
- **Browser verify:** PB + `pnpm dev`, then `mcp__chrome-devtools__*`; pass
  `initScript` setting `localStorage['tour-seen']='1'` or the Ustad tour
  navigates off the route. `--isolated` ⇒ fresh login each run. Use `emulate`,
  not `resize_page`, for mobile metrics.
- Dev leftovers: POL-05/10/19 have open quiz sessions → pre-flight skips a
  chapter until its run ends.
- Local class names collide with `dossier.css` globals (`.chev .tab .plate .seg
  .tag .brass .hex .track/.fill`) — rename or qualify.
