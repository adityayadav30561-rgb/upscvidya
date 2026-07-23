/** Shared content-repo loading for validate/sync. */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import YAML from "yaml";

export const CONTENT_DIR = join(process.cwd(), "content");

export const REGIONS = [
  "foundations", "system", "centre", "states",
  "grassroots", "institutions", "dynamics", "courtroom",
];
export const KINDS = ["chapter", "appendix"];
export const FORMATS = [
  "single-factual", "statement-based", "match-pairs", "assertion-reason",
  "chronology", "odd-one-out", "fill-appropriate",
];
export const SOURCE_TYPES = ["ai", "self", "external", "pyq", "ca"];
export const Q_STATUSES = ["draft", "validated", "live", "retired"];
export const ID_CODE_RE = /^(POL-\d{2}|APX-\d)$/;
export const PAPER_RE = /^([A-Z]+)-(\d{4})$/; // PYQ folder: CAPF-2022

/** Walk content/<subject>/<TOPIC-FOLDER>/ and return parsed units. */
export function loadContentTree() {
  const units = [];
  if (!existsSync(CONTENT_DIR)) return units;
  for (const subject of readdirSync(CONTENT_DIR)) {
    const subjectDir = join(CONTENT_DIR, subject);
    if (!statSync(subjectDir).isDirectory()) continue;
    for (const folder of readdirSync(subjectDir)) {
      const dir = join(subjectDir, folder);
      if (!statSync(dir).isDirectory()) continue;
      const unit = {
        folder,
        dir,
        rel: relative(process.cwd(), dir).replaceAll("\\", "/"),
        folderIdCode: (folder.match(/^(POL-\d{2}|APX-\d)/) ?? [null])[0],
        // PYQ papers (Prompt 12): /content/pyq/CAPF-2022/mcqs.json — no
        // topic.md, questions carry their own `topic` id_code instead.
        subject,
        paper: subject === "pyq" ? (folder.match(/^([A-Z]+)-(\d{4})$/) ?? null) : null,
        topicFile: null, // { frontmatter, body, raw }
        mcqsFile: null,  // { questions, raw }
        errors: [],
      };

      const topicPath = join(dir, "topic.md");
      if (existsSync(topicPath)) {
        const raw = readFileSync(topicPath, "utf8");
        const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        if (!m) {
          unit.errors.push({ file: `${unit.rel}/topic.md`, line: 1, msg: "missing YAML frontmatter block (--- ... ---)" });
        } else {
          try {
            unit.topicFile = { frontmatter: YAML.parse(m[1]) ?? {}, body: m[2].trim(), raw };
          } catch (err) {
            unit.errors.push({ file: `${unit.rel}/topic.md`, line: err.linePos?.[0]?.line ?? 1, msg: `frontmatter YAML: ${err.message}` });
          }
        }
      }

      const mcqsPath = join(dir, "mcqs.json");
      if (existsSync(mcqsPath)) {
        const raw = readFileSync(mcqsPath, "utf8");
        try {
          unit.mcqsFile = { questions: JSON.parse(raw), raw };
        } catch (err) {
          unit.errors.push({ file: `${unit.rel}/mcqs.json`, line: jsonErrorLine(raw, err), msg: `invalid JSON: ${err.message}` });
        }
      }

      units.push(unit);
    }
  }
  return units;
}

/** Line number of a question's "id" entry inside mcqs.json raw text (for precise errors). */
export function lineOfQid(raw, qid) {
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`"${qid}"`)) return i + 1;
  }
  return 1;
}

function jsonErrorLine(raw, err) {
  const m = String(err.message).match(/position (\d+)/);
  if (!m) return 1;
  return raw.slice(0, Number(m[1])).split(/\r?\n/).length;
}
