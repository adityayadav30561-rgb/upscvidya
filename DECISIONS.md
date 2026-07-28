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
  that damage does not self-heal — it needs a manual repair pass.
- Everything ingested/AI-drafted starts as `draft`; goes live only via human
  admin validation. Lifecycle: draft → validated → live → retired.
- Commercial-source questions are **rewritten** (concept kept, wording fresh);
  PYQs kept **verbatim**. Every question carries a `source` provenance block.

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

## Workflow

- One feature per session. `/clear` between. Never `/compact`. Memory lives in
  `docs/CURRENT_STATE.md`, not chat history.
- **Browser verification is Chrome DevTools MCP**, declared project-scoped in
  `.mcp.json`. The desktop app's `preview_start` does not exist in the VS Code
  extension, and a screenshot-only Playwright script cannot inspect network
  payloads — which the gating rules (server-trimmed premium, no pre-answer
  `answer_index`) have to be checked against. Playwright stays for behavioural
  e2e in `e2e/`; the MCP is for looking at and driving a real page.
