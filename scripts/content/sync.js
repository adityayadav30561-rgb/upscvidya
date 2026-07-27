#!/usr/bin/env node
/**
 * Content → PocketBase sync (build book Prompt 01).
 *
 * Usage:
 *   pnpm sync -- --env dev     (PB_URL_DEV,  default http://127.0.0.1:8090)
 *   pnpm sync -- --env prod    (PB_URL_PROD)
 *   creds: PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 *
 * Rules (from the build book):
 *   - upsert topics on id_code, questions on qid; update only changed fields
 *   - NEVER downgrade status (live in PB stays live even if repo says validated)
 *   - repo deletions → status=retired in PB, never hard delete
 *     (only for repo-managed questions; ca-sourced questions are exempt)
 *   - print a change report
 */
import { loadContentTree } from "./lib.js";

const envArg = process.argv.includes("--env")
  ? process.argv[process.argv.indexOf("--env") + 1]
  : "dev";
if (!["dev", "prod"].includes(envArg)) {
  console.error(`--env must be dev|prod, got "${envArg}"`);
  process.exit(1);
}
const PB_URL =
  envArg === "prod"
    ? process.env.PB_URL_PROD
    : process.env.PB_URL_DEV ?? "http://127.0.0.1:8090";
const EMAIL = process.env.PB_ADMIN_EMAIL;
const PASSWORD = process.env.PB_ADMIN_PASSWORD;
if (!PB_URL || !EMAIL || !PASSWORD) {
  console.error("need PB_URL_PROD (for --env prod), PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD");
  process.exit(1);
}

// status precedence — a record's status may only move forward via sync
const STATUS_RANK = { draft: 0, validated: 1, live: 2, retired: 3 };

let token;
async function api(path, opts = {}) {
  const res = await fetch(PB_URL + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
      ...opts.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${opts.method ?? "GET"} ${path} → ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function listAll(collection, filter = "") {
  const items = [];
  let page = 1;
  for (;;) {
    const q = await api(
      `/api/collections/${collection}/records?perPage=500&page=${page}` +
        (filter ? `&filter=${encodeURIComponent(filter)}` : "")
    );
    items.push(...q.items);
    if (page >= q.totalPages) break;
    page++;
  }
  return items;
}

const changed = (existing, patch) =>
  Object.keys(patch).filter((k) => JSON.stringify(existing[k]) !== JSON.stringify(patch[k]));

// ---------------------------------------------------------------- load + auth
// PYQ papers (content/pyq/CAPF-2023) have no folderIdCode — their questions name
// their own syllabus topic. Keep them, or the retire sweep below would treat
// every PYQ question as "removed from repo".
const units = loadContentTree().filter(
  (u) => !u.errors.length && (u.folderIdCode || u.subject === "pyq")
);
const auth = await api("/api/collections/_superusers/auth-with-password", {
  method: "POST",
  body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
});
token = auth.token;
console.log(`sync → ${PB_URL} (${envArg}) — ${units.length} repo unit(s)`);

const report = {
  topics: { created: 0, updated: 0, unchanged: 0 },
  questions: { created: 0, updated: 0, unchanged: 0, retired: 0 },
};

// -------------------------------------------------------------------- topics
const pbTopics = await listAll("topics");
const topicIdByCode = {};
for (const t of pbTopics) topicIdByCode[t.id_code] = t.id;

for (const unit of units) {
  if (!unit.topicFile) continue;
  const fm = unit.topicFile.frontmatter;
  const data = {
    id_code: fm.id_code,
    title: fm.title,
    part_no: fm.part_no,
    region: fm.region,
    kind: fm.kind,
    book_ref: fm.book_ref ?? "",
    mcq_floor: fm.mcq_floor,
    tags: fm.tags ?? [],
    guided_order: fm.guided_order,
    est_read_minutes: fm.est_read_minutes,
    prerequisites: fm.prerequisites ?? [],
    is_free: fm.is_free,
    notes_md: unit.topicFile.body,
    // status intentionally absent: PB owns it (admin flips draft→live);
    // new topics start as draft below
  };

  const existing = pbTopics.find((t) => t.id_code === fm.id_code);
  if (!existing) {
    const created = await api("/api/collections/topics/records", {
      method: "POST",
      body: JSON.stringify({ ...data, status: "draft" }),
    });
    topicIdByCode[fm.id_code] = created.id;
    report.topics.created++;
    console.log(`topic ${fm.id_code}: created (draft)`);
  } else {
    const diff = changed(existing, data);
    if (diff.length) {
      await api(`/api/collections/topics/records/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify(Object.fromEntries(diff.map((k) => [k, data[k]]))),
      });
      report.topics.updated++;
      console.log(`topic ${fm.id_code}: updated (${diff.join(", ")})`);
    } else {
      report.topics.unchanged++;
    }
  }
}

// ----------------------------------------------------------------- questions
// PYQ papers (Prompt 12) carry no topic.md — each question names the syllabus
// topic it belongs to, so the managed set is the union of both shapes.
const managedTopicIds = [
  ...new Set([
    ...units.map((u) => topicIdByCode[u.folderIdCode]).filter(Boolean),
    ...units
      .filter((u) => u.subject === "pyq")
      .flatMap((u) => (u.mcqsFile?.questions ?? []).map((q) => topicIdByCode[q.topic]))
      .filter(Boolean),
  ]),
];
const pbQuestions = managedTopicIds.length
  ? await listAll("questions", managedTopicIds.map((id) => `topic = "${id}"`).join(" || "))
  : [];
const pbByQid = Object.fromEntries(pbQuestions.map((q) => [q.qid, q]));
const repoQids = new Set();

for (const unit of units) {
  if (!unit.mcqsFile) continue;
  for (const q of unit.mcqsFile.questions) {
    if (unit.subject === "pyq" && !topicIdByCode[q.topic]) {
      console.warn(`question ${q.id}: skipped — topic ${q.topic} not synced yet`);
      continue;
    }
    repoQids.add(q.id);
    const { type, ...meta } = q.source ?? {};
    const data = {
      qid: q.id,
      // PYQ questions point at their own syllabus topic; topic units use the folder
      topic: topicIdByCode[unit.subject === "pyq" ? q.topic : unit.folderIdCode],
      stem: q.stem,
      options: q.options,
      answer_index: q.answer,
      explanation: q.explanation,
      tier: q.tier,
      format: q.format,
      exams: q.exams,
      source_type: type,
      source_meta: meta,
      status: q.status,
    };

    const existing = pbByQid[q.id];
    if (!existing) {
      await api("/api/collections/questions/records", {
        method: "POST",
        body: JSON.stringify({ ...data, attempts_count: 0, correct_count: 0 }),
      });
      report.questions.created++;
    } else {
      // never downgrade status
      if (STATUS_RANK[data.status] < STATUS_RANK[existing.status]) data.status = existing.status;
      const diff = changed(existing, data);
      if (diff.length) {
        await api(`/api/collections/questions/records/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify(Object.fromEntries(diff.map((k) => [k, data[k]]))),
        });
        report.questions.updated++;
        console.log(`question ${q.id}: updated (${diff.join(", ")})`);
      } else {
        report.questions.unchanged++;
      }
    }
  }
}

// repo deletions → retire (never hard delete; ca questions exempt — they are
// born in PB via the CA pipeline, not in this repo)
for (const q of pbQuestions) {
  if (!repoQids.has(q.qid) && q.status !== "retired" && q.source_type !== "ca") {
    await api(`/api/collections/questions/records/${q.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "retired" }),
    });
    report.questions.retired++;
    console.log(`question ${q.qid}: retired (removed from repo)`);
  }
}

// -------------------------------------------------------------------- report
const t = report.topics, qr = report.questions;
console.log(
  `\nchange report:\n` +
    `  topics    — created ${t.created}, updated ${t.updated}, unchanged ${t.unchanged}\n` +
    `  questions — created ${qr.created}, updated ${qr.updated}, retired ${qr.retired}, unchanged ${qr.unchanged}`
);
const totalChanges = t.created + t.updated + qr.created + qr.updated + qr.retired;
console.log(totalChanges === 0 ? "no changes — repo and PB in sync" : `${totalChanges} change(s) applied`);
