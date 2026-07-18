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
  REGIONS, KINDS, FORMATS, SOURCE_TYPES, Q_STATUSES, ID_CODE_RE,
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
console.log(`✓ ${units.length} topic(s), ${totalQ} question(s) — all valid`);
