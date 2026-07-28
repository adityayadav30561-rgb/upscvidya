#!/usr/bin/env node
/**
 * One-off repair: un-retire PYQ questions wrongly retired by the old sync bug.
 *
 * Background. `sync.js` used to build its "repo set" from units that had a
 * `folderIdCode`. PYQ papers (`content/pyq/CAPF-20xx`) have none — their
 * questions name their own syllabus topic — so every PYQ question looked
 * "removed from the repo" and the retire sweep set `status=retired` on it.
 * The sweep is fixed (sync.js keeps `subject === "pyq"` units), but sync NEVER
 * downgrades a status, so `retired` sticks forever. This script is the manual
 * pass that undoes it.
 *
 * Safety rules, deliberately narrow:
 *   - only touches questions whose `source_type = "pyq"`
 *   - only questions whose qid is still present in `content/pyq/`
 *   - only questions currently `retired`, restored to the status the repo declares
 *   - a PYQ retired in PB with no repo counterpart is REPORTED, never touched
 *     (that one may have been retired on purpose)
 *
 * Usage:
 *   pnpm repair:pyq -- --env dev              (dry run — prints the plan)
 *   pnpm repair:pyq -- --env prod             (dry run against prod)
 *   pnpm repair:pyq -- --env prod --apply     (writes)
 *
 * Env: PB_URL_DEV (default http://127.0.0.1:8090) / PB_URL_PROD,
 *      PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 */
import { loadContentTree } from "./lib.js";

const argv = process.argv;
const envArg = argv.includes("--env") ? argv[argv.indexOf("--env") + 1] : "dev";
const APPLY = argv.includes("--apply");
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

// ---------------------------------------------------------------- repo truth
const repoByQid = new Map(); // qid → { status, paper }
for (const unit of loadContentTree()) {
  if (unit.errors.length || unit.subject !== "pyq" || !unit.mcqsFile) continue;
  for (const q of unit.mcqsFile.questions) {
    if (q.id) repoByQid.set(q.id, { status: q.status, paper: unit.folder });
  }
}
if (repoByQid.size === 0) {
  console.error("no PYQ questions found under content/pyq — refusing to run");
  process.exit(1);
}

// `process.exit()` while fetch keep-alive sockets are still open aborts the
// Node process on Windows (libuv UV_HANDLE_CLOSING assertion). Return instead
// and let the loop drain, exactly as sync.js does.
async function main() {
  const auth = await api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  });
  token = auth.token;

  console.log(
    `repair:pyq → ${PB_URL} (${envArg}) — ${APPLY ? "APPLY" : "DRY RUN"} — ${repoByQid.size} PYQ question(s) in repo`
  );

  // ------------------------------------------------------------ the PB side
  const pbPyq = await listAll("questions", 'source_type = "pyq"');
  const retired = pbPyq.filter((q) => q.status === "retired");

  const plan = [];
  const orphans = [];
  for (const q of retired) {
    const repo = repoByQid.get(q.qid);
    if (!repo) {
      orphans.push(q.qid);
      continue;
    }
    if (repo.status === "retired") continue; // repo agrees — leave it
    plan.push({ id: q.id, qid: q.qid, to: repo.status, paper: repo.paper });
  }

  console.log(
    `  PB pyq questions: ${pbPyq.length} · retired: ${retired.length} · repairable: ${plan.length}`
  );
  for (const p of plan) console.log(`  ${APPLY ? "restore" : "would restore"} ${p.qid} (${p.paper}): retired → ${p.to}`);
  for (const qid of orphans) console.warn(`  skip ${qid}: retired in PB but absent from content/pyq — left alone`);

  if (!plan.length) {
    console.log("\nnothing to repair — PYQ statuses are already correct");
    return;
  }
  if (!APPLY) {
    console.log(`\ndry run — re-run with --apply to write ${plan.length} change(s)`);
    return;
  }

  let done = 0;
  for (const p of plan) {
    await api(`/api/collections/questions/records/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: p.to }),
    });
    done++;
  }
  console.log(`\n✓ restored ${done} PYQ question(s)`);
}

await main();
