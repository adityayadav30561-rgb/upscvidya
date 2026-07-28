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

Target length: **500–700 words** of prose (prompts don't count).
So most chapters land on **1 predict + 2 cloze + 1 recall**.

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
  columns of comparison (tables scroll horizontally on their own).

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
