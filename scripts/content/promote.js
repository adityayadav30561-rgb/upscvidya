#!/usr/bin/env node
/**
 * Promote content draft → live (the missing half of the sync workflow).
 *
 * `pnpm sync` deliberately lands everything as `draft`: PB owns topic status,
 * and repo questions are authored as draft so nothing reaches users unreviewed.
 * Draft is invisible (the client reads `status = "live"` only), so a synced
 * chapter stays dark until this runs. That is the review gate — this script is
 * the act of passing it.
 *
 * Usage:
 *   pnpm promote -- --env dev  --topic POL-06
 *   pnpm promote -- --env prod --topic POL-06,POL-10
 *   pnpm promote -- --env prod --all
 *   pnpm promote -- --env prod --all --dry-run
 *
 *   creds: PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD (+ PB_URL_PROD for --env prod)
 *
 * Rules:
 *   - forward only. draft|validated → live. `retired` is NEVER resurrected —
 *     a retired question was retired on purpose (sync retires repo deletions).
 *   - CA-sourced questions are skipped: they are born in PB from the CA
 *     pipeline and belong to the admin validation queue, not a bulk promote.
 *     `--include-ca` overrides for the rare deliberate case.
 *   - idempotent: a second run finds everything live and changes nothing.
 *   - a topic promoted with zero live questions is reported as a warning —
 *     users would get a chapter whose quiz has no questions.
 */

// ------------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const values = (name) =>
  argv.reduce((acc, a, i) => (a === name && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);

const envArg = values("--env")[0] ?? "dev";
if (!["dev", "prod"].includes(envArg)) {
  console.error(`--env must be dev|prod, got "${envArg}"`);
  process.exit(1);
}

const ALL = flag("--all");
const DRY = flag("--dry-run");
const INCLUDE_CA = flag("--include-ca");
// --topic POL-06 --topic POL-10, or --topic POL-06,POL-10
const codes = [
  ...new Set(
    values("--topic")
      .flatMap((v) => v.split(","))
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)
  ),
];

if (ALL && codes.length) {
  console.error("pass either --all or --topic, not both");
  process.exit(1);
}
if (!ALL && !codes.length) {
  console.error(
    "nothing selected. usage:\n" +
      "  pnpm promote -- --env dev  --topic POL-06\n" +
      "  pnpm promote -- --env prod --all [--dry-run]"
  );
  process.exit(1);
}

const PB_URL =
  envArg === "prod" ? process.env.PB_URL_PROD : (process.env.PB_URL_DEV ?? "http://127.0.0.1:8090");
const EMAIL = process.env.PB_ADMIN_EMAIL;
const PASSWORD = process.env.PB_ADMIN_PASSWORD;
if (!PB_URL || !EMAIL || !PASSWORD) {
  console.error("need PB_URL_PROD (for --env prod), PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD");
  process.exit(1);
}

// -------------------------------------------------------------------- api
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
  if (!res.ok)
    throw new Error(`${opts.method ?? "GET"} ${path} → ${res.status}: ${JSON.stringify(body)}`);
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

// ------------------------------------------------------------------- auth
const auth = await api("/api/collections/_superusers/auth-with-password", {
  method: "POST",
  body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
});
token = auth.token;

console.log(
  `promote → ${PB_URL} (${envArg}) — ${ALL ? "all topics" : codes.join(", ")}` +
    (DRY ? "  [DRY RUN — no writes]" : "")
);

// --------------------------------------------------------------- resolve
// Everything past this point runs inside main() so a bail-out can `return`.
// Calling process.exit() here would kill the process while undici's socket is
// still closing — on Windows that surfaces as a libuv assertion crash, not a
// clean exit 1. Set process.exitCode and let the event loop drain instead.
process.exitCode = await main();

async function main() {
  const pbTopics = await listAll("topics");
  const byCode = new Map(pbTopics.map((t) => [t.id_code, t]));

  let targets;
  if (ALL) {
    targets = pbTopics;
  } else {
    const missing = codes.filter((c) => !byCode.has(c));
    if (missing.length) {
      console.error(
        `\nno topic in PB for: ${missing.join(", ")}\n` +
          `run \`pnpm sync -- --env ${envArg}\` first, or check the id_code spelling.`
      );
      return 1;
    }
    targets = codes.map((c) => byCode.get(c));
  }

  if (!targets.length) {
    console.log("no topics in PB — nothing to promote.");
    return 0;
  }

  return await promote(targets);
}

// --------------------------------------------------------------- promote
async function promote(targets) {
  const report = {
    topicsPromoted: 0,
    topicsAlreadyLive: 0,
    qPromoted: 0,
    qAlreadyLive: 0,
    qRetiredSkipped: 0,
    qCaSkipped: 0,
  };
  const emptyTopics = [];

  for (const topic of targets) {
    const questions = await listAll("questions", `topic = "${topic.id}"`);

    const toPromote = questions.filter((q) => {
      if (q.status === "live" || q.status === "retired") return false;
      if (q.source_type === "ca" && !INCLUDE_CA) return false;
      return true;
    });

    report.qAlreadyLive += questions.filter((q) => q.status === "live").length;
    report.qRetiredSkipped += questions.filter((q) => q.status === "retired").length;
    report.qCaSkipped += questions.filter(
      (q) => q.source_type === "ca" && q.status !== "live" && q.status !== "retired" && !INCLUDE_CA
    ).length;

    for (const q of toPromote) {
      if (!DRY)
        await api(`/api/collections/questions/records/${q.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "live" }),
        });
      report.qPromoted++;
    }

    const topicWasLive = topic.status === "live";
    if (!topicWasLive) {
      if (!DRY)
        await api(`/api/collections/topics/records/${topic.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "live" }),
        });
      report.topicsPromoted++;
    } else {
      report.topicsAlreadyLive++;
    }

    // live pool after this run — what a user's quiz will actually serve
    const livePool = questions.filter((q) => q.status === "live").length + toPromote.length;
    if (livePool === 0) emptyTopics.push(topic.id_code);

    if (!topicWasLive || toPromote.length) {
      console.log(
        `  ${topic.id_code}  ${topicWasLive ? "live" : "draft → live"}` +
          `  ·  ${toPromote.length} question(s) promoted  ·  ${livePool} live`
      );
    }
  }

  // -------------------------------------------------------------- report
  const r = report;
  console.log(
    `\npromotion report:\n` +
      `  topics    — promoted ${r.topicsPromoted}, already live ${r.topicsAlreadyLive}\n` +
      `  questions — promoted ${r.qPromoted}, already live ${r.qAlreadyLive}, ` +
      `retired (left alone) ${r.qRetiredSkipped}, ca queue (skipped) ${r.qCaSkipped}`
  );

  if (emptyTopics.length) {
    console.warn(
      `\n⚠ live with 0 live questions: ${emptyTopics.join(", ")}\n` +
        `  the chapter reads fine but its quiz has nothing to serve.`
    );
  }

  const total = r.topicsPromoted + r.qPromoted;
  if (total === 0) {
    console.log("\nnothing to promote — everything selected is already live.");
  } else if (DRY) {
    console.log(`\n${total} change(s) WOULD be applied. re-run without --dry-run to commit.`);
  } else {
    console.log(`\n${total} change(s) applied — now visible to users.`);
  }
  return 0;
}
