# DECISIONS — locked architecture calls

> Why things are the way they are, so no one (human or Claude) "rediscovers"
> them in 3 months. Append-only in spirit; change a line only when the decision
> genuinely reverses (and say why). Mandatory read on every new session.

## Progression (XP / ranks)

- **Server is the ONLY authority** for anything cheatable — XP, scores, quiz
  answers, timers, entitlements. Computed in `pb_hooks`, never trusted from client.
- **14-grade rank ladder** is canonical (design wins over build book's 10).
- Rank/XP math exists in **two mirrored copies**: `src/lib/ranks.ts` +
  `src/lib/xp.ts` (client display) ↔ `RANKS` in `pb/pb_hooks/lib/xp.js` (truth).
  Edit both in the same commit. `lib/xp.js` `awardXP` is the single XP path.
- `answer_index` never appears in a network response before the user answers.
  Options are server-shuffled; the mapping stays in the `quiz_sessions` row.

## Content

- **Never hard-delete content.** Sync retires (`status=retired`), never deletes —
  attempt history references questions. Sync never downgrades status, always idempotent.
- Sync's "repo set" is **every valid unit**, not just id_code folders: PYQ papers
  (`content/pyq/CAPF-20xx`) carry no `folderIdCode`, and dropping them made the
  retire sweep retire every PYQ question. Because sync never downgrades status,
  that damage does not self-heal — it needs a manual repair pass. That pass is
  `scripts/content/repair-pyq-status.js` (`pnpm repair:pyq`): dry run by
  default, un-retires only PYQ qids still present in `content/pyq/`, restores
  the repo's declared status, and never touches a retired PYQ with no repo
  counterpart (that one may have been retired deliberately).

- **Chapter notes carry retrieval prompts by rule, not by taste:** 1 `:::predict`
  after the intro, 1 `:::cloze` per ~300 words, 1 `:::recall` before the quiz
  CTA. The predict block asks something the intro has *not* answered yet — a
  prediction the reader must commit to before the text resolves it.
- Everything ingested/AI-drafted starts as `draft`; goes live only via human
  admin validation. Lifecycle: draft → validated → live → retired.
- Commercial-source questions are **rewritten** (concept kept, wording fresh);
  PYQs kept **verbatim**. Every question carries a `source` provenance block.

## Quiz length (changed 2026-07)

- **A quiz serves the topic's ENTIRE live pool.** `/api/quiz/start` sets
  `N = pool.length` — no cap, no floor. Previously a fixed 12 (topic) / 15
  (drill) sample. A 50-question chapter gives a 50-question quiz.
  Tier buckets (30/40/30) now order the presentation rather than truncate it.
- **`mcq_floor` is an authoring target, never a count.** It is the minimum pool a
  chapter must eventually carry (from the master doc). Displaying it told users a
  12-question quiz had 35 questions. The UI must use **`live_questions`**.
- `live_questions` is computed in SQL on `topics_public` / `topics_teaser`
  (migrations 1754100000 / 1754200000) because `questions` is deliberately not
  client-listable — the client cannot count them itself. Counting exposes a
  number, never a stem or an `answer_index`, so it is safe on a public view.

## Reader (changed 2026-07)

- The topic reader **paginates horizontally** — swipe, mouse drag, wheel or
  arrow keys turn a page. It does **not** scroll vertically.
- Pagination is **CSS multi-column**, not manual node measuring: the content box
  is one page wide with `column-width` equal to it, so the flow spills into
  columns and we translate by whole pages. This reflows arbitrary HTML — tables,
  callouts, the interactive RecallBlock — with no splitting logic to maintain.
- **A monolithic block breaks pagination.** Anything that cannot be fragmented
  (`overflow: auto` wrappers, `break-inside: avoid`) jumps whole to the next page
  when it does not fit and strands the heading above it on a blank one. Hence:
  tables fragment and fit the column instead of scrolling sideways (a horizontal
  scroll inside a horizontally-paging reader fights the turn gesture), and a
  dev-only warning names any page under 45% full.
- **No word cap on chapters.** The 500–700 target existed because vertical
  scrolling made length feel expensive; pagination removes that. Chapters are as
  long as teaching them properly takes and are written for a first-time reader.

## Who authors chapters (decided 2026-07)

- **Chapter notes and MCQs are authored by Claude Opus 5 in-session, never by the
  API failover chain.** A full `draft-chapter` CLI was built and run end-to-end on
  POL-05 to test the alternative. Its **MCQs passed** (45 questions, median 62-word
  explanations addressing every distractor, real confusables, 0 positional refs);
  its **notes failed** — broken table rows, 4+ column tables at 412px, number-trails
  applied mechanically to non-counts ("originally 0 amendments → 1 enacted → 1
  today"), Berubari→Kesavananda taught three times, and 6 clozes where the density
  rule wanted 10.
- The cause was **architectural, not model quality**: each section was a stateless
  call that saw only its siblings' *headings*, never their text, so it could not
  know what had already been taught or count words for cloze density. Fixable, but
  the fix costs more than authoring in-session is worth.
- **The CLI was therefore deleted**, along with its `pnpm draft:chapter` script.
  `scripts/ingest/ai.js` was reverted to its pre-experiment state. If this is ever
  revisited, feed each section call the *text* already written, not the outline.
- **The AI chain's scope is now: current affairs (`ca.pb.js`, `ca_extra.pb.js`,
  `infra/jobs/ca-pipeline/`) and MCQ *ingestion* (`pnpm ingest`, which normalises
  and classifies MCQs that already exist).** It does not author content.

## AI providers (decided 2026-07)

- **Five interchangeable providers in a failover chain**: OpenRouter (Nemotron 3
  Ultra) → Gemini → Mistral → OpenCode Zen → Groq. All speak the OpenAI
  chat-completions shape, so only base URL, model and key differ.
- It is a real **failover**, not a preference order: a call moves down the chain
  on 429 / 401 / 403 / 404 or persistent errors and throws only when all are
  spent, so a long ingest run survives one provider's daily cap (they differ by
  orders of magnitude — 50/day vs 50/min). `AI_PROVIDER=<name>` pins one.
- Model output is parsed with a **brace-balanced extractor** that strips `<think>`
  blocks and code fences: the default model reasons, and `response_format` is not
  guaranteed to be honoured by whichever provider is serving.
- The chain is duplicated in three places (`scripts/ingest/ai.js`, the CA
  pipeline, `ca_extra.pb.js`) because they cannot share code — separate deploy
  unit and PB's JSVM isolation. Change all three together.

## Entitlements

- **Premium gating is server-trimmed, not CSS-hidden.** Free user's payload for a
  gated topic contains only teaser text. `entitle.js` is the single price/grant authority.

## Design

- `docs/design` owns layout / copy / IA. **FIELD DOSSIER** handoff owns colour /
  material / type. Compose from `dossier.css` utilities + `tokens.css` vars —
  no ad-hoc hex, no one-off gradients.
- When restyling to a `.plate`, delete the old `background/border/box-shadow`
  first or they fight.

## PocketBase hooks

- JSVM is isolated per handler: **inline every helper** inside its handler.
  Shared logic loads via `require` at call time (`lib/xp.js`, `lib/entitle.js`,
  `lib/notify.js`).
- JSON fields: parse the STRING form (`JSON.parse(String(v))`). Date fields:
  test `String(v).trim() !== ""`, never `!!v`. Config with valid `0`: use
  `== null ?`, never `x || default`.
- Schema changes = a NEW timestamped migration. Never edit an applied one.

## Reward ceremonies

- RankUp (4c) and TerritoryCaptured (4d) are **isolated components** in
  `src/lib/components/`. Shared keyframes live at the bottom of `dossier.css` —
  don't duplicate them per component.
- `/dev/kitchen-sink` is the single component/animation showcase.

## Retrieval practice (in-chapter)

- Prompts (`:::predict` / `:::cloze` / `:::recall` in `topic.md`) are
  **ungraded and client-only**: no endpoint, no XP, no SR card. A
  client-reported recall would be a free XP farm, and XP has one authority.
- Because a Svelte component cannot mount inside `{@html}`, notes render as a
  **block list** (`renderBlocks()`), not one HTML string. The reader loops it.
- Attempt marks live in `localStorage` per topic and store `{mark, label,
  timestamp}` — the label is the fact itself, since a block id prints nothing.
  Consequence: weak facts are per-device and die on reinstall. Making them
  durable is a server change (a `users` JSON field), worth it only with real
  users.
- The label is the **answer**, never the question: cloze → the missed line with
  its blanks filled; predict/recall → the first sentence of the answer body
  (prompt only as a fallback). Echoing the question back teaches nothing.
  Built by `factLabel()`/`clipLabel()` in `markdown.ts` — pure and unit-tested,
  not inside the component.
- The pre-flight "already shown" stamp is keyed **per block id**, not one
  timestamp per chapter: a chapter-wide stamp loses any miss written in the same
  millisecond. Legacy numeric stamps are still read.
- Malformed `:::` blocks fail `pnpm validate`, never a reader.

## Distribution & hosting (decided 2026-07)

- **Ship as a PWA, not an app store build.** Beta is handed out as a **URL + a
  one-page install guide** (Add to Home Screen). `static/manifest.webmanifest`
  is already install-ready (`display: standalone`, maskable icon).
- **App updates are automatic** — `src/service-worker.ts` keys its cache on
  `version`, calls `skipWaiting()` + `clients.claim()`, and drops stale caches on
  activate. Deploy → user reloads → new version. No download, no store review.
  An already-open tab keeps old JS until it reloads (a "new version" toast is
  still to build).
- **APK comes later as a TWA**, downloaded from our own site — **not** Play
  Store (avoids the $25 fee and the 12-testers-for-14-days closed-test rule for
  new personal accounts). A TWA wraps the live URL, so auto-update is unchanged.
- **iOS is the onboarding risk:** install is Safari-only via Share → Add to Home
  Screen, with no prompt, and web push only works once installed. The install
  guide must cover it with screenshots.
- **Hosting, two phases:**
  - **Beta → PocketHost** (hosted PocketBase, free, `*.pockethost.io` with TLS)
    + **Cloudflare Pages** (`*.pages.dev`) for the static app. **No domain, ₹0.**
    Runs without the dev machine on — that was the deciding factor.
  - **Launch → Oracle Always Free ARM VPS** (already scripted in `infra/`) +
    a purchased domain: apex → Pages, `api.` → the VPS, Caddy takes the cert.
  - Migration between them = copy `pb_data/` + swap `PUBLIC_PB_URL` + append the
    new redirect URI to the *same* Google OAuth client.
- **PocketBase is the backend AND the database** (one Go binary + SQLite on
  disk). That is why persistent disk is non-negotiable, and why free tiers
  without it (Render free, Vercel, Railway) are disqualified — not a preference.
- **HTTPS is mandatory, not cosmetic:** service workers, PWA install and Google
  OAuth all require a secure origin, and an HTTPS frontend cannot call an HTTP
  backend. A raw VPS IP is therefore unusable — hence the domain at launch.
- **Payments stay off for the whole beta.** Razorpay keys unset; the paywall
  routes to the beta banner. Beta is free and open via `beta_free_until`
  (see the 🔒 note after Prompt 18 in the build book).

## Auth (Google)

- Client side is done: `loginWithGoogle()` → `authWithOAuth2({provider:'google'})`.
  Everything else is **config**, in two places: Google Cloud Console + the PB
  `users` collection Options. No app code changes.
- The **client secret lives in PocketBase's own database**, never in `.env` and
  never in git. PB config does not travel with the code, so each host (local,
  PocketHost, Oracle) is configured separately.
- Consent screen: **External**, default non-sensitive scopes (`email`,
  `profile`, `openid`) ⇒ **no Google verification review**. "Testing" mode caps
  at 100 users; publishing to Production needs a privacy-policy URL.
- Copy the redirect URL **from the PB admin panel** — it is version-specific,
  never guess it.

## Workflow

- One feature per session. `/clear` between. Never `/compact`. Memory lives in
  `docs/CURRENT_STATE.md`, not chat history.
- **Browser verification is Chrome DevTools MCP**, declared project-scoped in
  `.mcp.json`. The desktop app's `preview_start` does not exist in the VS Code
  extension, and a screenshot-only Playwright script cannot inspect network
  payloads — which the gating rules (server-trimmed premium, no pre-answer
  `answer_index`) have to be checked against. Playwright stays for behavioural
  e2e in `e2e/`; the MCP is for looking at and driving a real page.
