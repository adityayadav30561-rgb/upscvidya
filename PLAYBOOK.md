# PLAYBOOK — the rules I follow with Claude Code

> My holy bible. Condition on the left, action on the right. When in doubt,
> obey the table. Golden law: **a big context window is the tax. Keep it small.**
> `/clear` is free. `/compact` and post-limit resume re-bill the WHOLE window.

---

## THE ONE LAW

> Never `/compact`. Prefer `/clear` + the state file.
> One feature per session. Clear between features.

---

## Daily flow (the happy path)

```
START session
   │
   ▼
[ Recovery prompt ]  ← read only the 3 docs, don't scan repo
   │
   ▼
[ Work prompt ]      ← "continue with <thing>"
   │
   ▼
one feature done?  ──no──►  keep working (same session)
   │yes
   ▼
[ End prompt ]       ← Claude rewrites CURRENT_STATE.md
   │
   ▼
/clear               ← FREE. wipes window.
   │
   ▼
back to START
```

---

## Condition → Action

| # | CONDITION | ACTION |
|---|-----------|--------|
| 1 | **Starting a new session** | Paste **Recovery prompt** (below). Nothing else first. |
| 2 | **After recovery, ready to build** | Paste **Work prompt**: `Continue with <feature>.` |
| 3 | **Finished a feature** (screen/fix done, tree clean) | Paste **End prompt** → then run `/clear` → new session. |
| 4 | **Context bar hits ~50%** and I'm at a clean stop | Same as #3 (end + clear). Don't wait for 90%. |
| 5 | **Context ~50% but mid-edit** (file half-done) | Finish the file first. THEN #3. Never clear mid-edit. |
| 6 | **Usage limit HIT** | Immediately paste **End prompt** so state is saved. Then stop. When limit restores → **`/clear` FIRST**, then #1. Do NOT resume the old window (that's the 40% tax). |
| 7 | **Usage limit restored** | `/clear` → Recovery prompt (#1). Never continue the pre-limit chat. |
| 8 | **Want to switch accounts** | #3 (end + save state). Other account starts at #1. State file carries everything. |
| 9 | **Files moved / new file added** | Tell Claude to update `docs/PROJECT_INDEX.md` (in the End prompt or inline). |
| 10 | **Architecture decision changed** | Tell Claude to update `DECISIONS.md` (create if missing). |
| 11 | **Tempted to `/compact`** | Don't. Do #3 instead. Only compact if mid-edit AND can't stop to save state. |
| 12 | **Claude starts Glob/Grep-ing the whole repo** | Stop it: "use PROJECT_INDEX.md, don't scan." |
| 13 | **New feature, unrelated to current state** | #3 the old one first (save state) → `/clear` → #1 → start new feature. |
| 14 | **Just a tiny question, no code** | Ask in current session if small. If context already big → `/clear` first, ask fresh. |

---

## The prompts (copy-paste)

### Recovery prompt (start every session)
```
New session. Read ONLY:
  - CLAUDE.md §0 + §2
  - docs/CURRENT_STATE.md
  - docs/PROJECT_INDEX.md
  - DECISIONS.md
Do NOT scan the repository.
Summarise: current goal · current feature · current files · next step.
Then WAIT for my next instruction.
```

### Work prompt
```
Continue with <feature>.
Read ONLY the files referenced in CURRENT_STATE.md. Do not inspect unrelated
folders. Do not browser-search. Do not verify unless I ask.
Implement one logical unit this turn.
```

### End prompt (before every /clear)
```
End session. Rewrite docs/CURRENT_STATE.md (<500 words: Current goal / Completed /
In progress / Next / Active files / Do NOT / Notes). Update docs/PROJECT_INDEX.md
only if files moved or were added. Update DECISIONS.md only if an architecture
decision changed. Keep concise.
```

### Feature Complete Checklist (Claude runs this before every /clear)
```
Before ending, confirm:
  ✓ code builds (pnpm check clean, or note why not)
  ✓ current feature complete
  ✓ CURRENT_STATE.md updated
  ✓ PROJECT_INDEX.md updated (if files moved)
  ✓ DECISIONS.md updated (if architecture changed)
  ✓ active files listed
Then stop.
```

---

## Frugal rules (keep every session cheap)

1. **One feature per session.** Clear between.
2. **No browser/test verify unless I explicitly ask** — biggest token sink.
3. **Read from the 3 docs, not the repo.** No repo-wide scans.
4. **Small window > everything.** Every extra file read is re-billed each turn.
5. **State lives in `docs/CURRENT_STATE.md`, not in the chat history.**

---

## The 3 living docs (where memory lives)

| File | Holds | Changes |
|------|-------|---------|
| `CLAUDE.md` | Operating manual, build status (§2), rules | rarely |
| `docs/CURRENT_STATE.md` | What's in flight / next / active files | **every session** |
| `docs/PROJECT_INDEX.md` | thing → file path map | only when files move |
| `DECISIONS.md` | Architecture decisions (mandatory read) | rarely |
