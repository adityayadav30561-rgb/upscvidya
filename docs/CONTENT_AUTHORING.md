# Content Authoring Template

> The fixed shape of every `content/<subject>/<ID>-<slug>/topic.md`. Give raw
> material (a Laxmikanth chapter, notes, a paste) and it gets cast into this —
> same skeleton every time. Only the section headings and the facts change.
> Validated by `scripts/content/validate.js`; rendered by `renderBlocks()` in
> `src/lib/markdown.ts`.

---

## 1. The skeleton

```markdown
---
id_code: POL-NN            # must match the folder prefix
title: Chapter Title
part_no: 1                 # Constitution part / syllabus part
region: foundations        # foundations | centre | states | … (validate.js REGIONS)
kind: chapter              # chapter | drill
book_ref: Laxmikanth ch. N
mcq_floor: 15              # minimum MCQs this chapter must eventually carry
tags:
  - kebab-case-topic
  - article-NN
guided_order: NN           # position in the guided path
est_read_minutes: 5
prerequisites:
  - POL-MM
is_free: true              # free chapters are fully public; false ⇒ ~120-word teaser
---

# Chapter Title

<INTRO — 2-4 sentences. What the thing is, which Article creates it, and the
single framing line that tells the reader how to read the rest.>

:::predict <A question the intro has NOT answered yet.>
<The answer, bolded on the fact that matters.>
:::

## <Section 1>

<Prose, lists, a table.>

> [!note] <A single takeaway worth a FIELD NOTE box.>

:::cloze
<Sentence with {{blanks}} on the examinable words.>
<Second sentence with {{another blank|accepted alternative}}.>
:::

## <Section 2>

<More prose. One cloze per ~300 words, so a 600-word chapter gets two.>

> [!exam] <The trap examiners actually set — counts, dates, contrasts.>

## <Section 3>

<…>

:::recall In one line — <a question needing synthesis, not lookup.>
<Model answer, 1-2 sentences.>
:::
```

No fixture footer, no sign-off line. The `:::recall` block is the last thing in
the file — the reader's quiz CTA follows it on screen.

---

## 2. The prompt rule (non-negotiable)

| Block | Where | How many |
|---|---|---|
| `:::predict` | immediately after the intro, before the first `##` | exactly 1 |
| `:::cloze` | at the end of a section, after the facts it tests | 1 per ~300 words |
| `:::recall` | last block in the file | exactly 1 |

**There is no word cap.** A chapter runs as long as teaching it properly takes.
The old 500–700 target was written when the reader scrolled vertically and length
felt like a cost; the reader now **paginates horizontally**, so a long chapter is
just more pages, not a worse experience. Cutting a chapter to hit a number
produced revision summaries that only work for someone who already knows the
material.

Write for a reader meeting the topic for the **first time**: explain *why* a
provision exists and what problem it solved before listing what it says, and keep
the detail an exam actually tests. Laxmikanth ch. 1 lands near **2,000 words**;
a thin chapter may need 600. Let the material decide.

Cloze count still follows density — **1 per ~300 words** — so a 2,000-word
chapter carries ~6, plus exactly 1 predict and 1 recall.

### What makes each block work

- **predict** — must ask something the intro *has not resolved*. The reader
  commits to a guess, then reads the answer. A question the intro already
  answered is a quiz, not a prediction.
- **cloze** — blank the **examinable** word: a number, a date, a name, an
  Article, a majority type. Never blank a connective or an adjective. Use
  `{{Nehru|Jawaharlal Nehru}}` when more than one phrasing is fair. Answer
  matching is case- and punctuation-insensitive (`normalizeAnswer()`), so
  `{{26 November 1949}}` accepts `26 november 1949`.
- **recall** — needs synthesis across sections ("why does X matter if Y?"),
  not a fact lookup. One line to answer.

### Why the prompt is never the label

A miss is remembered by the **answer**, never the question (`factLabel()` in
`markdown.ts`) — cloze stores the filled-in line, predict/recall the first
sentence of the answer body. So **write answer bodies that lead with the fact**:
"The **42nd Amendment, 1976**. It inserted…" is a good weak-fact label;
"Well, it depends…" is a useless one.

---

## 3. Callouts

`> [!type] text` inside a blockquote:

| Marker | Renders as | Use for |
|---|---|---|
| `[!note]` / `[!field]` | FIELD NOTE | the one line to carry out of a section |
| `[!exam]` | EXAM ANGLE | the trap that gets set — counts, date pairs, contrasts |
| `[!tip]` | TIP | a mnemonic or a way to remember |
| `[!warn]` | WATCH OUT | a common confusion between two similar things |

An unmarked `>` blockquote stays a plain EXAM ANGLE block.

---

## 4. Prose conventions

- **Bold the examinable token** — numbers, dates, names, Article numbers,
  majority types. Nothing else. Bold everywhere = bold nowhere.
- Prefer a **contrast framing** where the syllabus sets one up (VP vs President,
  recommended vs enacted counts, Berubari vs Kesavananda). Most MCQs are
  contrast questions.
- **Number-trails get their own line**, since they are the top MCQ source:
  "8 recommended → 10 enacted (1976) → 11 today (2002)".
- Case names, committee names and Acts in full on first use, with the year.
- No current officeholders, no "as of today" claims — they rot.
- Lists over paragraphs for anything enumerable; a table when there are ≥3
  columns of comparison. **Tables now wrap to fit the page and flow across page
  breaks** — they no longer scroll sideways, because a horizontal scroll inside a
  horizontally-paging reader fights the turn gesture. Keep columns few and cells
  short; a 5-column table is unreadable at 412px whatever the CSS does.

### No empty pages

The reader paginates horizontally, so a block that cannot be split — a scroll
wrapper, or anything with `break-inside: avoid` — jumps whole to the next page
when it does not fit, stranding the heading above it on a blank one. The reader
CSS handles the usual cases (tables fragment, headings stick to what follows),
and in `pnpm dev` the reader **logs a warning** naming any page under 45% full.
If you see that warning after authoring a chapter, the cause is almost always one
very tall unbreakable block — split it into two, or shorten it.

---

## 5. Ship it

```bash
pnpm validate                # blocks malformed :::, bad frontmatter, dupe ids
pnpm sync -- --env dev       # upsert into local PocketBase
```

`validate` catches an unclosed `:::`, a cloze with no `{{blank}}`, an empty
`{{}}`, unbalanced braces, a `:::predict`/`:::recall` missing its question line
or its answer body, and any unknown `:::` kind. A malformed block must fail the
validator, never a reader.

MCQs live beside the notes in `mcqs.json` — separate schema, see
`docs/polity-mvp-master.md` §MCQ and the `source` provenance block.

---

## 6. MCQ tiers — check the distribution, not just each question

`tier` is 1–5 and the server buckets it (1–2 / 3 / 4+) for XP multipliers and for
the gold grade, which needs **all three buckets present** in a quiz. Tagging each
question sensibly still lets the *bank* drift easy, because a fact-listy chapter
tempts you to call every named-fact recall tier 2.

Target shape, matching POL-01…POL-05:

| Tier | Share | What lands here |
|---|---|---|
| 1 | ~5% | bedrock one-liners only — the 4-6 facts nobody may miss |
| 2 | ~20% | single named-fact recall |
| 3 | ~40% | **the default** — two facts held together, a contrast, a count pair |
| 4 | ~25% | fine detail, obscure Acts, precise membership/dates |
| 5 | ~7% | synthesis traps, assertion-reason, multi-step chronology |

Check the whole bank after authoring, not question by question:

```bash
node -e "const q=require('./content/polity/<DIR>/mcqs.json');const t={};q.forEach(x=>t[x.tier]=(t[x.tier]||0)+1);console.log(q.length,t)"
```

Also check **answer position balance** the same way (`x.answer`) — aim for ~25%
each. When rebalancing, never reorder options in `statement-based` or
`assertion-reason` questions (fixed option text), nor where the options form a
natural sequence (years, amendment numbers, counts).
