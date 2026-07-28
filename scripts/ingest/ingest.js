#!/usr/bin/env node
/**
 * MCQ ingestion CLI (build book Prompt 02).
 *
 * pnpm ingest -- --topic POL-08 --source "external:Arihant" --file input.txt
 * pnpm ingest -- --topic POL-05 --source self --file mine.txt
 * pnpm ingest -- --topic POL-05 --source pyq:CAPF-2022 --file paper.txt
 * pnpm ingest -- --topic POL-05 --source ai --file drafts.txt
 * pnpm ingest -- --topic POL-05 --source "external:X" --mode image-list --file ./photos
 *
 * Flags: --no-ai (skip Groq: heuristic tier/format, explanation left as-is)
 *
 * Everything outputs status "draft" — nothing goes live without validation.
 * Dupes (>0.75 stem similarity vs the topic's existing bank) land in
 * dupes.json beside mcqs.json instead of the main output.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadContentTree } from "../content/lib.js";
import { parseLooseMcqText } from "./parse.js";
import { findDupe } from "./dedupe.js";
import { enhanceQuestion, guessFormat, hasAiKey, aiLabel } from "./ai.js";

// ---- load .env (repo root) without a dependency
const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// ---- args
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const topicCode = arg("--topic");
const sourceArg = arg("--source");
const file = arg("--file");
const mode = arg("--mode") ?? "text";
const noAi = process.argv.includes("--no-ai");

if (!topicCode || !sourceArg || !file) {
  console.error('usage: pnpm ingest -- --topic POL-NN --source "external:<name>"|self|pyq:<EXAM>-<YEAR>|ai --file <path> [--mode image-list] [--no-ai]');
  process.exit(1);
}

// ---- source block
let source, rewrite = false;
if (sourceArg.startsWith("external:")) {
  source = { type: "external", name: sourceArg.slice(9), ref: arg("--ref") ?? null };
  rewrite = true; // commercial publications: rewrite-don't-copy
} else if (sourceArg.startsWith("pyq:")) {
  const m = sourceArg.slice(4).match(/^([A-Za-z]+)-(\d{4})$/);
  if (!m) { console.error(`--source pyq format: pyq:CAPF-2022 (got "${sourceArg}")`); process.exit(1); }
  source = { type: "pyq", exam: m[1].toUpperCase(), year: Number(m[2]), qno: null };
  rewrite = false; // government papers reproduced verbatim
} else if (sourceArg === "self") {
  source = { type: "self", author: arg("--author") ?? "self" };
} else if (sourceArg === "ai") {
  source = { type: "ai", model: "llama-3.3-70b-versatile", validated_by: null, validated_on: null };
} else {
  console.error(`unknown --source "${sourceArg}"`);
  process.exit(1);
}

// ---- locate topic folder
const unit = loadContentTree().find((u) => u.folderIdCode === topicCode);
if (!unit) {
  console.error(`no content folder for ${topicCode} — create content/<subject>/${topicCode}-<slug>/ (topic.md + mcqs.json) first`);
  process.exit(1);
}
const mcqsPath = join(unit.dir, "mcqs.json");
const dupesPath = join(unit.dir, "dupes.json");
const existing = existsSync(mcqsPath) ? JSON.parse(readFileSync(mcqsPath, "utf8")) : [];
const existingDupes = existsSync(dupesPath) ? JSON.parse(readFileSync(dupesPath, "utf8")) : [];

// ---- gather raw text
let rawText;
if (mode === "image-list") {
  try {
    execFileSync("tesseract", ["--version"], { stdio: "pipe" });
  } catch {
    console.error("tesseract not found on PATH — install it for --mode image-list (https://github.com/tesseract-ocr/tesseract)");
    process.exit(1);
  }
  const images = readdirSync(file).filter((f) => /\.(png|jpe?g|webp|tiff?)$/i.test(f)).sort();
  if (!images.length) { console.error(`no images in ${file}`); process.exit(1); }
  console.log(`OCR over ${images.length} image(s)...`);
  rawText = images
    .map((img) => execFileSync("tesseract", [join(file, img), "stdout"], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }))
    .join("\n\n");
} else {
  rawText = readFileSync(file, "utf8");
}

// ---- parse
const parsed = parseLooseMcqText(rawText);
if (!parsed.length) { console.error("parsed 0 questions — check the input format"); process.exit(1); }
console.log(`parsed ${parsed.length} question(s) from ${mode === "image-list" ? "OCR text" : file}`);
for (const q of parsed) for (const w of q.warnings) console.warn(`  ⚠ ${w}`);

// ---- next qid allocator (respects mcqs.json AND dupes.json)
const usedNums = [...existing, ...existingDupes.map((d) => d.question ?? d)]
  .map((q) => Number((q.id ?? "").match(/-Q(\d+)$/)?.[1] ?? 0));
let nextNum = Math.max(0, ...usedNums);
const nextQid = () => `${topicCode}-Q${String(++nextNum).padStart(3, "0")}`;

// ---- enhance + dedup
const useAi = !noAi && hasAiKey();
if (useAi) {
  console.log(`AI: ${aiLabel()}`);
} else {
  console.log(noAi ? "--no-ai: heuristic classification, explanations untouched" : "no AI key set: falling back to heuristic classification (set OPENROUTER_API_KEY for tier/format/explanations/rewrites)");
  if (rewrite) console.warn("  ⚠ external commercial source WITHOUT AI rewrite — wording is copied; re-run with an AI key before publishing");
}

const today = new Date().toISOString().slice(0, 10);
const accepted = [], dupes = [];
const dedupPool = [...existing]; // grows as we accept, catching intra-batch dupes

for (const [i, q] of parsed.entries()) {
  let enhanced;
  if (useAi) {
    try {
      enhanced = await enhanceQuestion(q, { topicTitle: unit.topicFile?.frontmatter?.title ?? topicCode, rewrite });
    } catch (err) {
      console.warn(`  ⚠ question ${i + 1}: AI call failed (${err.message}) — heuristic fallback`);
    }
  }
  enhanced ??= {
    stem: q.stem,
    options: q.options,
    answer_index: q.answer ?? 0,
    explanation: q.explanation || "[explanation pending — drafted without AI, complete in admin review]",
    tier: 2,
    format: guessFormat(q.stem),
  };

  const entry = {
    id: null, // assigned on accept
    topic: topicCode,
    stem: enhanced.stem,
    options: enhanced.options,
    answer: enhanced.answer_index,
    explanation: enhanced.explanation,
    tier: enhanced.tier,
    format: enhanced.format,
    exams: ["capf"],
    source: source.type === "pyq" ? { ...source, qno: i + 1 } : source,
    status: "draft",
    added: today,
  };

  const dupe = findDupe(entry.stem, dedupPool);
  if (dupe) {
    dupes.push({ reason: `similar to ${dupe.qid} (score ${dupe.score})`, question: entry });
  } else {
    entry.id = nextQid();
    accepted.push(entry);
    dedupPool.push({ id: entry.id, stem: entry.stem });
  }
}

// ---- write
if (accepted.length) writeFileSync(mcqsPath, JSON.stringify([...existing, ...accepted], null, 2) + "\n");
if (dupes.length) writeFileSync(dupesPath, JSON.stringify([...existingDupes, ...dupes], null, 2) + "\n");

console.log(`\n${accepted.length} accepted → ${unit.rel}/mcqs.json (${accepted.map((q) => q.id).join(", ") || "-"})`);
console.log(`${dupes.length} flagged  → ${unit.rel}/dupes.json`);
console.log(`run "pnpm validate" before committing`);
