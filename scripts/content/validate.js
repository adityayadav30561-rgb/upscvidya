#!/usr/bin/env node
/**
 * Content validator (build book Prompt 01).
 * Checks every topic.md frontmatter + mcqs.json against the schema in
 * docs/polity-mvp-master.md. Exits non-zero with precise file:line errors.
 *
 * Usage: pnpm validate
 */
import {
  loadContentTree, lineOfQid,
  REGIONS, KINDS, FORMATS, SOURCE_TYPES, Q_STATUSES, ID_CODE_RE, PAPER_RE,
} from "./lib.js";

const errors = [];
const err = (file, line, msg) => errors.push({ file, line, msg });

const units = loadContentTree();
if (units.length === 0) {
  console.error("no content units found under /content");
  process.exit(1);
}

const seenQids = new Map(); // qid → file (repo-wide uniqueness)
const seenIdCodes = new Map();

for (const unit of units) {
  for (const e of unit.errors) err(e.file, e.line, e.msg); // parse-stage errors

  const topicRel = `${unit.rel}/topic.md`;
  const mcqsRel = `${unit.rel}/mcqs.json`;

  const isPyq = unit.subject === "pyq";

  if (isPyq) {
    // /content/pyq/CAPF-2022/mcqs.json — a past paper, not a topic unit
    if (!PAPER_RE.test(unit.folder)) {
      err(unit.rel, 1, `PYQ folder must be EXAM-YYYY (e.g. CAPF-2022): "${unit.folder}"`);
      continue;
    }
    const [, exam, year] = unit.folder.match(PAPER_RE);
    if (!unit.mcqsFile) {
      err(mcqsRel, 1, "mcqs.json missing");
      continue;
    }
    unit.mcqsFile.questions.forEach((q, i) => {
      const line = lineOfQid(unit.mcqsFile.raw, q.id ?? `#${i}`);
      const label = q.id ?? `question #${i + 1}`;
      if (!q.id) { err(mcqsRel, line, 'question missing "id"'); return; }
      if (!q.id.startsWith(`${exam}-${year}-Q`)) {
        err(mcqsRel, line, `${label}: qid must start with ${exam}-${year}-Q`);
      }
      if (seenQids.has(q.id)) err(mcqsRel, line, `${label}: duplicate qid (also in ${seenQids.get(q.id)})`);
      seenQids.set(q.id, mcqsRel);
      // a PYQ still belongs to a syllabus topic — that drives the topic chip
      if (!q.topic || !ID_CODE_RE.test(q.topic)) {
        err(mcqsRel, line, `${label}: "topic" must be a syllabus id_code (POL-NN / APX-N), got ${JSON.stringify(q.topic)}`);
      }
      if (!q.stem || typeof q.stem !== "string") err(mcqsRel, line, `${label}: missing/empty "stem"`);
      if (!Array.isArray(q.options) || q.options.length !== 4) err(mcqsRel, line, `${label}: "options" must be an array of exactly 4`);
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) err(mcqsRel, line, `${label}: "answer" must be an integer 0-3`);
      if (!q.explanation || !String(q.explanation).trim()) err(mcqsRel, line, `${label}: "explanation" is required`);
      if (!Number.isInteger(q.tier) || q.tier < 1 || q.tier > 5) err(mcqsRel, line, `${label}: "tier" must be 1-5`);
      if (!FORMATS.includes(q.format)) err(mcqsRel, line, `${label}: "format" "${q.format}" invalid`);
      if (!Q_STATUSES.includes(q.status)) err(mcqsRel, line, `${label}: "status" "${q.status}" invalid`);
      // provenance is the whole point of a PYQ
      const src = q.source;
      if (!src || typeof src !== "object") { err(mcqsRel, line, `${label}: "source" block is mandatory`); return; }
      if (src.type !== "pyq") err(mcqsRel, line, `${label}: source.type must be "pyq" in a PYQ paper, got "${src.type}"`);
      if (src.exam !== exam) err(mcqsRel, line, `${label}: source.exam "${src.exam}" does not match folder "${exam}"`);
      if (String(src.year) !== year) err(mcqsRel, line, `${label}: source.year "${src.year}" does not match folder "${year}"`);
      if (src.qno === undefined || src.qno === null || src.qno === "") err(mcqsRel, line, `${label}: source.qno is required for a PYQ`);
    });
    continue;
  }

  if (!unit.folderIdCode) {
    err(unit.rel, 1, `folder name must start with an id_code (POL-NN or APX-N): "${unit.folder}"`);
    continue;
  }

  // ---- topic.md frontmatter
  if (!unit.topicFile) {
    err(topicRel, 1, "topic.md missing");
  } else {
    const fm = unit.topicFile.frontmatter;
    const fmLine = (key) => {
      const lines = unit.topicFile.raw.split(/\r?\n/);
      const i = lines.findIndex((l) => l.startsWith(key + ":"));
      return i === -1 ? 1 : i + 1;
    };

    const required = ["id_code", "title", "part_no", "region", "kind", "mcq_floor", "guided_order", "est_read_minutes", "is_free"];
    for (const k of required) {
      if (fm[k] === undefined || fm[k] === null || fm[k] === "") err(topicRel, 1, `frontmatter missing required field "${k}"`);
    }
    if (fm.id_code && !ID_CODE_RE.test(fm.id_code)) err(topicRel, fmLine("id_code"), `id_code "${fm.id_code}" not POL-NN / APX-N`);
    if (fm.id_code && fm.id_code !== unit.folderIdCode) err(topicRel, fmLine("id_code"), `id_code "${fm.id_code}" does not match folder "${unit.folder}"`);
    if (fm.region && !REGIONS.includes(fm.region)) err(topicRel, fmLine("region"), `region "${fm.region}" not one of ${REGIONS.join("|")}`);
    if (fm.kind && !KINDS.includes(fm.kind)) err(topicRel, fmLine("kind"), `kind "${fm.kind}" not one of ${KINDS.join("|")}`);
    for (const k of ["part_no", "mcq_floor", "guided_order", "est_read_minutes"]) {
      if (fm[k] !== undefined && !Number.isInteger(fm[k])) err(topicRel, fmLine(k), `"${k}" must be an integer, got ${JSON.stringify(fm[k])}`);
    }
    if (fm.tags !== undefined && !Array.isArray(fm.tags)) err(topicRel, fmLine("tags"), `"tags" must be an array`);
    if (fm.prerequisites !== undefined && !Array.isArray(fm.prerequisites)) err(topicRel, fmLine("prerequisites"), `"prerequisites" must be an array`);
    if (typeof fm.is_free !== "boolean" && fm.is_free !== undefined) err(topicRel, fmLine("is_free"), `"is_free" must be true/false`);
    if (fm.kind === "chapter" && !unit.topicFile.body) err(topicRel, 1, "chapter topic.md has an empty body (notes required for chapters)");

    // ---- in-chapter retrieval prompts (`:::predict` / `:::cloze` / `:::recall`)
    // Parsed client-side by renderBlocks() in src/lib/markdown.ts — a malformed
    // block would silently swallow the rest of the chapter, so catch it here.
    {
      const lines = unit.topicFile.raw.split(/\r?\n/);
      const KINDS_RECALL = ["predict", "cloze", "recall"];
      let fenced = false;
      let open = null; // { kind, line, head, body: [] }
      lines.forEach((line, i) => {
        const ln = i + 1;
        if (/^\s*```/.test(line)) fenced = !fenced;
        if (fenced) { if (open) open.body.push(line); return; }

        if (open) {
          if (/^:::\s*$/.test(line)) {
            const body = open.body.join("\n").trim();
            if (open.kind === "cloze") {
              const src = open.head ? `${open.head}\n${body}` : body;
              if (!src.trim()) err(topicRel, open.line, ":::cloze block is empty");
              else if (!/\{\{[^}]+\}\}/.test(src)) err(topicRel, open.line, ":::cloze block has no {{blank}} — nothing to recall");
              if (/\{\{\s*\}\}/.test(src)) err(topicRel, open.line, ":::cloze block has an empty {{}} blank");
              const unclosed = (src.match(/\{\{/g) || []).length !== (src.match(/\}\}/g) || []).length;
              if (unclosed) err(topicRel, open.line, ":::cloze block has an unbalanced {{ }} blank");
            } else {
              if (!open.head) err(topicRel, open.line, `:::${open.kind} needs its question on the opening line`);
              if (!body) err(topicRel, open.line, `:::${open.kind} needs a body (the answer to reveal)`);
            }
            open = null;
            return;
          }
          open.body.push(line);
          return;
        }

        const m = line.match(/^:::(\w*)\s*(.*)$/);
        if (!m) return;
        if (!m[1]) { err(topicRel, ln, 'stray ":::" — closes a block that was never opened'); return; }
        if (!KINDS_RECALL.includes(m[1].toLowerCase())) {
          err(topicRel, ln, `unknown ::: block "${m[1]}" — use ${KINDS_RECALL.join(" | ")}`);
          return;
        }
        open = { kind: m[1].toLowerCase(), line: ln, head: m[2].trim(), body: [] };
      });
      if (open) err(topicRel, open.line, `:::${open.kind} block is never closed with ":::"`);
    }

    if (fm.id_code) {
      if (seenIdCodes.has(fm.id_code)) err(topicRel, fmLine("id_code"), `duplicate id_code "${fm.id_code}" (also in ${seenIdCodes.get(fm.id_code)})`);
      seenIdCodes.set(fm.id_code, topicRel);
    }
  }

  // ---- mcqs.json
  if (!unit.mcqsFile) {
    err(mcqsRel, 1, "mcqs.json missing");
    continue;
  }
  const { questions, raw } = unit.mcqsFile;
  if (!Array.isArray(questions)) {
    err(mcqsRel, 1, "mcqs.json must be a JSON array");
    continue;
  }

  for (const q of questions) {
    const line = q.id ? lineOfQid(raw, q.id) : 1;
    const label = q.id ?? "<no id>";

    if (!q.id) { err(mcqsRel, line, "question missing \"id\""); continue; }
    if (!q.id.startsWith(unit.folderIdCode + "-Q")) err(mcqsRel, line, `${label}: qid does not match folder id_code ${unit.folderIdCode} (expected ${unit.folderIdCode}-QNNN)`);
    if (q.topic !== unit.folderIdCode) err(mcqsRel, line, `${label}: "topic" is "${q.topic}", expected "${unit.folderIdCode}"`);
    if (seenQids.has(q.id)) err(mcqsRel, line, `${label}: duplicate qid (also in ${seenQids.get(q.id)})`);
    seenQids.set(q.id, mcqsRel);

    if (!q.stem || typeof q.stem !== "string") err(mcqsRel, line, `${label}: missing/empty "stem"`);
    if (!Array.isArray(q.options) || q.options.length !== 4) err(mcqsRel, line, `${label}: "options" must be an array of exactly 4 (got ${Array.isArray(q.options) ? q.options.length : typeof q.options})`);
    else if (q.options.some((o) => typeof o !== "string" || !o.trim())) err(mcqsRel, line, `${label}: all 4 options must be non-empty strings`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) err(mcqsRel, line, `${label}: "answer" must be an integer 0-3 (got ${JSON.stringify(q.answer)})`);
    if (!q.explanation || !String(q.explanation).trim()) err(mcqsRel, line, `${label}: "explanation" is required and non-empty`);
    if (!Number.isInteger(q.tier) || q.tier < 1 || q.tier > 5) err(mcqsRel, line, `${label}: "tier" must be an integer 1-5 (got ${JSON.stringify(q.tier)})`);
    if (!FORMATS.includes(q.format)) err(mcqsRel, line, `${label}: "format" "${q.format}" not one of ${FORMATS.join("|")}`);
    if (!Array.isArray(q.exams) || q.exams.length === 0) err(mcqsRel, line, `${label}: "exams" must be a non-empty array`);
    if (!q.source || typeof q.source !== "object") err(mcqsRel, line, `${label}: "source" provenance block is mandatory`);
    else if (!SOURCE_TYPES.includes(q.source.type)) err(mcqsRel, line, `${label}: source.type "${q.source.type}" not one of ${SOURCE_TYPES.join("|")}`);
    if (!Q_STATUSES.includes(q.status)) err(mcqsRel, line, `${label}: "status" "${q.status}" not one of ${Q_STATUSES.join("|")}`);
  }
}

if (errors.length) {
  for (const e of errors) console.error(`${e.file}:${e.line}: ${e.msg}`);
  console.error(`\n✗ validation failed — ${errors.length} error(s) across ${units.length} unit(s)`);
  process.exit(1);
}
const totalQ = units.reduce((n, u) => n + (u.mcqsFile?.questions?.length ?? 0), 0);
const papers = units.filter((u) => u.subject === "pyq").length;
console.log(
  `✓ ${units.length - papers} topic(s), ${papers} PYQ paper(s), ${totalQ} question(s) — all valid`
);
