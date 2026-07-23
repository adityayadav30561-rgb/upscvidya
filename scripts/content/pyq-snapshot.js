#!/usr/bin/env node
/**
 * PYQ SEO snapshot (build book Prompt 12, point 5).
 *
 * The app is an SPA, but /pyq/capf-[year] must be PRERENDERED static HTML for
 * organic search. Prerendering happens at build time, when PocketBase may not
 * be reachable — so counts come from the repo content itself, which is the
 * source of truth anyway. Writes src/lib/pyq-snapshot.json.
 *
 * Publishes only summary data (counts + topic breakdown), never the questions.
 *
 * Usage: pnpm pyq:snapshot   (run it whenever /content/pyq changes)
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadContentTree, PAPER_RE } from "./lib.js";

const units = loadContentTree();

// syllabus topic titles come from the topic units in the same repo
const topicTitles = {};
for (const u of units) {
  if (u.subject === "pyq" || !u.topicFile) continue;
  const fm = u.topicFile.frontmatter;
  if (fm?.id_code) topicTitles[fm.id_code] = { title: fm.title, region: fm.region };
}

const papers = [];
for (const u of units) {
  if (u.subject !== "pyq" || !u.mcqsFile) continue;
  const m = u.folder.match(PAPER_RE);
  if (!m) continue;
  const [, exam, year] = m;

  const byTopic = {};
  for (const q of u.mcqsFile.questions) {
    const code = q.topic;
    if (!byTopic[code]) {
      byTopic[code] = {
        code,
        title: topicTitles[code]?.title ?? code,
        region: topicTitles[code]?.region ?? "",
        count: 0,
      };
    }
    byTopic[code].count++;
  }

  papers.push({
    slug: `${exam.toLowerCase()}-${year}`,
    exam,
    year: Number(year),
    count: u.mcqsFile.questions.length,
    topics: Object.values(byTopic).sort((a, b) => b.count - a.count),
  });
}

papers.sort((a, b) => b.year - a.year);

const snapshot = {
  generated_at: new Date().toISOString().slice(0, 10),
  total_questions: papers.reduce((n, p) => n + p.count, 0),
  papers,
};

const out = join(process.cwd(), "src", "lib", "pyq-snapshot.json");
const next = JSON.stringify(snapshot, null, 2) + "\n";
const prev = existsSync(out) ? readFileSync(out, "utf8") : "";
if (prev === next) {
  console.log(`✓ pyq-snapshot.json unchanged (${papers.length} paper(s))`);
} else {
  writeFileSync(out, next);
  console.log(
    `✓ wrote pyq-snapshot.json — ${papers.length} paper(s), ${snapshot.total_questions} question(s)`
  );
}
