#!/usr/bin/env node
/**
 * UPSCVidya — dev seed: upserts fixture topics + questions into PocketBase.
 *
 * Usage:
 *   PB_URL=http://127.0.0.1:8090 PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node pb/seed/seed.js
 *
 * Idempotent: matches on id_code / qid; updates existing records.
 * Node 18+ (built-in fetch).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";
const EMAIL = process.env.PB_ADMIN_EMAIL;
const PASSWORD = process.env.PB_ADMIN_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const topics = JSON.parse(readFileSync(join(here, "fixtures/topics.json"), "utf8"));
const questions = JSON.parse(readFileSync(join(here, "fixtures/questions.json"), "utf8"));

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
  if (!res.ok) {
    throw new Error(`${opts.method ?? "GET"} ${path} → ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function upsert(collection, filter, data) {
  const q = await api(
    `/api/collections/${collection}/records?filter=${encodeURIComponent(filter)}&perPage=1`
  );
  if (q.items?.length) {
    await api(`/api/collections/${collection}/records/${q.items[0].id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return { id: q.items[0].id, action: "updated" };
  }
  const created = await api(`/api/collections/${collection}/records`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return { id: created.id, action: "created" };
}

const auth = await api("/api/collections/_superusers/auth-with-password", {
  method: "POST",
  body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
});
token = auth.token;
console.log("authenticated as superuser");

const counts = { created: 0, updated: 0 };
const topicIds = {}; // id_code → record id

for (const t of topics) {
  const r = await upsert("topics", `id_code = "${t.id_code}"`, t);
  topicIds[t.id_code] = r.id;
  counts[r.action]++;
  console.log(`topic ${t.id_code}: ${r.action}`);
}

for (const q of questions) {
  const { topic_code, ...rest } = q;
  const topicId = topicIds[topic_code];
  if (!topicId) throw new Error(`question ${q.qid}: unknown topic ${topic_code}`);
  const r = await upsert("questions", `qid = "${q.qid}"`, {
    ...rest,
    topic: topicId,
    attempts_count: 0,
    correct_count: 0,
  });
  counts[r.action]++;
}
console.log(`questions: ${questions.length} processed`);
console.log(`done — created ${counts.created}, updated ${counts.updated}`);
