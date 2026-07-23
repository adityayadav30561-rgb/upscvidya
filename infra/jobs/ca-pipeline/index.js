#!/usr/bin/env node
/**
 * UPSCVidya — current-affairs pipeline (build book Prompt 13).
 * Runs on the VPS from /opt/jobs/ca-pipeline, cron 05:30 and 17:30 IST.
 *
 *   node index.js              # live: writes ca_items drafts + jobs_log
 *   node index.js --dry-run    # fetch + classify + draft, write NOTHING
 *   node index.js --dry-run --limit 5 --print
 *
 * Steps
 *   1. Fetch every enabled `sources` RSS feed (PIB all-ministries by default).
 *   2. Filter obvious noise, then dedup by URL and title similarity against
 *      the last 14 days of ca_items.
 *   3. Per candidate, ask the model for: CAPF relevance + confidence,
 *      a 60-90 word summary, 1-3 linked POL topics, and 2-3 draft MCQs.
 *   4. Insert ca_items (status=draft) with their draft questions.
 *   5. Log the run to jobs_log; a non-zero exit is what alerting watches.
 *
 * NOTE ON THE MODEL STEP: with GROQ_API_KEY set, step 3 is a real LLM call.
 * Without a key the job runs in HEURISTIC mode — keyword topic tagging and an
 * extractive summary — so the pipeline is still exercisable end to end (and a
 * dry run still produces schema-valid drafts). Heuristic drafts are marked
 * `confidence <= 0.5`, which keeps them below the batch-approve threshold in
 * the admin queue: a human must read every one.
 */

import { pathToFileURL } from "node:url";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const PRINT = args.includes("--print");
const LIMIT = Number((args.find((a) => a.startsWith("--limit")) || "").split("=")[1] || args[args.indexOf("--limit") + 1] || 12);

const MIN_CONFIDENCE = Number(process.env.CA_MIN_CONFIDENCE || 0.55);
const DEDUP_DAYS = 14;
const SIMILARITY_CUTOFF = 0.82;

/* ------------------------------------------------------------------ utils */

const log = (...a) => console.log(new Date().toISOString(), ...a);

/** Normalised token set for title similarity. */
function tokens(s) {
  return new Set(
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

/** Jaccard similarity — cheap and good enough for headline dedup. */
export function similarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Minimal RSS parse — title/link/description/pubDate per <item>. */
export function parseRss(xml) {
  const items = [];
  const blocks = String(xml).split(/<item[\s>]/i).slice(1);
  for (const raw of blocks) {
    const body = raw.split(/<\/item>/i)[0];
    const pick = (tag) => {
      const m = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      if (!m) return "";
      return m[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
    };
    const title = pick("title");
    if (!title) continue;
    items.push({
      title,
      link: pick("link"),
      description: pick("description"),
      pubDate: pick("pubDate"),
    });
  }
  return items;
}

/* --------------------------------------------------------------- taxonomy */

/** POL topics the classifier may tag. Loaded live so new content is taggable. */
async function loadTopics(token) {
  const res = await fetch(`${PB_URL}/api/collections/topics_public/records?perPage=500&sort=guided_order`, {
    headers: token ? { Authorization: token } : {},
  });
  const data = await res.json();
  return (data.items || []).map((t) => ({ code: t.id_code, title: t.title, region: t.region }));
}

/** Keyword map for heuristic tagging — deliberately conservative. */
const KEYWORDS = [
  [/preamble|socialist|secular|sovereign/i, "POL-05"],
  [/fundamental duty|duties|article 51a/i, "POL-10"],
  [/fundamental right|article 1[4-9]|article 2[01]/i, "POL-08"],
  [/directive principle|dpsp/i, "POL-09"],
  [/vice.?president|rajya sabha chairman/i, "POL-19"],
  [/president of india|rashtrapati/i, "POL-18"],
  [/prime minister|cabinet|council of ministers/i, "POL-20"],
  [/parliament|lok sabha|rajya sabha|bill|session/i, "POL-23"],
  [/supreme court|chief justice|bench/i, "POL-26"],
  [/high court/i, "POL-34"],
  [/governor|raj bhavan/i, "POL-30"],
  [/panchayat|gram sabha|local body/i, "POL-39"],
  [/municipal|urban local/i, "POL-40"],
  [/election commission|cec|electoral/i, "POL-43"],
  [/finance commission|devolution/i, "POL-46"],
  [/gst council/i, "POL-47"],
  [/cag|comptroller|audit/i, "POL-52"],
  [/niti aayog/i, "POL-56"],
  [/human rights|nhrc/i, "POL-57"],
  [/cbi|investigation agency/i, "POL-65"],
  [/lokpal|lokayukta|vigilance/i, "POL-66"],
  [/nia|terror/i, "POL-67"],
  [/disaster|ndma|ndrf/i, "POL-68"],
  [/emergency|article 356|president.s rule/i, "POL-17"],
  [/centre.state|federal|inter.state/i, "POL-15"],
  [/citizenship|caa|nrc/i, "POL-07"],
  [/amendment act|constitutional amendment/i, "POL-11"],
  [/anti.defection|tenth schedule/i, "POL-86"],
  [/scheduled tribe|tribal area|fifth schedule|sixth schedule/i, "POL-42"],
  [/union territory|jammu|ladakh/i, "POL-41"],
];

const CATEGORIES = [
  [/court|judg|bench|justice|constitution|parliament|bill|amendment|election|commission/i, "POLITY"],
  [/crpf|bsf|itbp|cisf|ssb|army|navy|air force|security|naxal|terror|border|police/i, "SECURITY"],
  [/rbi|gdp|inflation|repo|budget|tax|gst|economy|fiscal|trade/i, "ECONOMY"],
  [/scheme|yojana|ministry|cabinet approves|sanction/i, "GOVERNANCE"],
];

/** Obvious non-starters — administrative notices, appointments-only blurbs. */
const NOISE = /(tender|corrigendum|recruitment result|vacancy circular|obituary|photo caption)/i;

/* ------------------------------------------------------- model / heuristic */

async function groqJson(prompt, schemaHint) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You prepare current-affairs material for CAPF Assistant Commandant aspirants. " +
            "Reply with JSON only, matching the requested shape exactly. " +
            "Summaries must be factual and in your own wording. " +
            schemaHint,
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

/** Trim a blurb to the 60-90 word window the design asks for. */
export function clampWords(text, max = 90) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(" ");
  return words.slice(0, max).join(" ").replace(/[,;:]$/, "") + " …";
}

export function heuristicCategory(text) {
  for (const [re, cat] of CATEGORIES) if (re.test(text)) return cat;
  return "GOVERNANCE";
}

export function heuristicTopics(text, validCodes) {
  const hits = [];
  for (const [re, code] of KEYWORDS) {
    if (re.test(text) && !hits.includes(code)) hits.push(code);
    if (hits.length >= 3) break;
  }
  const valid = hits.filter((c) => !validCodes || validCodes.has(c));
  return valid.slice(0, 3);
}

/** Heuristic draft: no LLM, deliberately low confidence so a human reads it. */
function heuristicDraft(item, validCodes) {
  const text = `${item.title} ${item.description}`;
  const topics = heuristicTopics(text, validCodes);
  return {
    relevant: topics.length > 0,
    confidence: topics.length > 0 ? 0.5 : 0.2,
    category: heuristicCategory(text),
    summary: clampWords(item.description || item.title),
    linked_topics: topics,
    exam_angle: topics.length
      ? `Links to ${topics.join(", ")} — verify before publishing.`
      : "",
    questions: [], // never fabricate MCQs without a model
    mode: "heuristic",
  };
}

async function modelDraft(item, topics) {
  const taxonomy = topics.map((t) => `${t.code} ${t.title}`).join("\n");
  const prompt = `News item:
TITLE: ${item.title}
BODY: ${item.description}
SOURCE: ${item.link}

Available Polity topics (tag 1-3 by code, only from this list):
${taxonomy}

Return JSON:
{
  "relevant": boolean,          // is this useful for CAPF AC General Ability?
  "confidence": number,         // 0-1
  "category": "POLITY"|"SECURITY"|"ECONOMY"|"GOVERNANCE",
  "summary": string,            // 60-90 words, factual, your own wording
  "linked_topics": string[],    // 1-3 codes from the list above
  "exam_angle": string,         // one line: how this could be asked
  "questions": [                // 2-3 MCQs, or [] if the item can't support them
    { "stem": string, "options": [string,string,string,string],
      "answer": 0, "explanation": string, "tier": 1, "format": "single-factual" }
  ]
}`;
  const out = await groqJson(prompt, "Every MCQ needs exactly 4 options and a full explanation.");
  return { ...out, mode: "model" };
}

/* --------------------------------------------------------------- pb access */

async function pbAuth() {
  if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) return null;
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`pb auth failed: ${res.status}`);
  return (await res.json()).token;
}

async function pb(path, token, init = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/* -------------------------------------------------------------------- main */

async function main() {
  const started = Date.now();
  const report = { fetched: 0, candidates: 0, created: 0, skipped_dupe: 0, skipped_low: 0, errors: [] };

  const token = DRY_RUN && !PB_ADMIN_EMAIL ? null : await pbAuth();
  if (!token && !DRY_RUN) throw new Error("PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD required for a live run");

  // 1. sources
  let sources = [];
  if (token) {
    const data = await pb("/api/collections/sources/records?perPage=200&filter=" + encodeURIComponent("enabled=true"), token);
    sources = data.items || [];
  }
  if (sources.length === 0) {
    sources = [{ name: "PIB — All Releases", url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3", kind: "rss" }];
    log("no sources collection reachable — using the built-in PIB feed");
  }

  // 2. fetch + parse
  const items = [];
  for (const s of sources) {
    try {
      const res = await fetch(s.url, { headers: { "User-Agent": "UPSCVidya-CA-Pipeline/1.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const parsed = parseRss(xml);
      for (const p of parsed) items.push({ ...p, source_name: s.name });
      log(`fetched ${parsed.length} item(s) from ${s.name}`);
    } catch (err) {
      report.errors.push(`${s.name}: ${err.message}`);
      log(`FETCH FAILED ${s.name}: ${err.message}`);
    }
  }
  report.fetched = items.length;

  // 3. filter + dedup
  let recent = [];
  if (token) {
    const since = new Date(Date.now() - DEDUP_DAYS * 86400000).toISOString().slice(0, 10);
    const data = await pb(
      "/api/collections/ca_items/records?perPage=500&filter=" + encodeURIComponent(`date >= "${since}"`),
      token
    );
    recent = data.items || [];
  }
  const seenUrls = new Set(recent.map((r) => r.source_url).filter(Boolean));
  const recentTitles = recent.map((r) => r.headline);

  const candidates = [];
  const batchTitles = [];
  for (const it of items) {
    if (NOISE.test(it.title)) continue;
    if (it.link && seenUrls.has(it.link)) { report.skipped_dupe++; continue; }
    const against = [...recentTitles, ...batchTitles];
    let best = 0, bestTitle = "";
    for (const t of against) {
      const s = similarity(it.title, t);
      if (s > best) { best = s; bestTitle = t; }
    }
    if (best >= SIMILARITY_CUTOFF) {
      report.skipped_dupe++;
      continue;
    }
    batchTitles.push(it.title);
    candidates.push({ ...it, dupe_score: best, dupe_of_title: best > 0.5 ? bestTitle : "" });
    if (candidates.length >= LIMIT) break;
  }
  report.candidates = candidates.length;
  log(`${candidates.length} candidate(s) after filter/dedup (${report.skipped_dupe} deduped)`);

  // 4. classify + draft
  const topics = token ? await loadTopics(token) : [];
  const validCodes = topics.length ? new Set(topics.map((t) => t.code)) : null;
  const drafts = [];
  for (const c of candidates) {
    try {
      const d = GROQ_API_KEY ? await modelDraft(c, topics) : heuristicDraft(c, validCodes);
      if (!d.relevant || (d.confidence ?? 0) < MIN_CONFIDENCE) {
        report.skipped_low++;
        if (!GROQ_API_KEY && d.relevant) {
          // heuristic mode floors at 0.5; keep them but flag clearly
        } else {
          continue;
        }
      }
      drafts.push({
        headline: c.title,
        summary: d.summary,
        source_name: c.source_name,
        source_url: c.link,
        category: d.category,
        confidence: d.confidence,
        linked_topics: (d.linked_topics || []).filter((t) => !validCodes || validCodes.has(t)),
        exam_angle: d.exam_angle || "",
        dupe_score: c.dupe_score,
        questions: d.questions || [],
        mode: d.mode,
      });
    } catch (err) {
      report.errors.push(`draft "${c.title.slice(0, 40)}": ${err.message}`);
    }
  }

  // 5. write (or print)
  if (DRY_RUN) {
    log(`DRY RUN — ${drafts.length} draft(s) produced, nothing written`);
    if (PRINT) console.log(JSON.stringify(drafts.slice(0, 5), null, 2));
  } else {
    const today = new Date().toISOString().slice(0, 10) + " 00:00:00.000Z";
    for (const d of drafts) {
      try {
        const qIds = [];
        for (const q of d.questions) {
          if (!Array.isArray(q.options) || q.options.length !== 4) continue;
          const topicCode = d.linked_topics[0];
          const topic = topics.find((t) => t.code === topicCode);
          if (!topic) continue;
          const full = await pb(`/api/collections/topics_public/records?perPage=1&filter=${encodeURIComponent(`id_code="${topicCode}"`)}`, token);
          const topicId = full.items?.[0]?.id;
          if (!topicId) continue;
          const created = await pb("/api/collections/questions/records", token, {
            method: "POST",
            body: JSON.stringify({
              qid: `CA-${Date.now()}-${qIds.length}`,
              topic: topicId,
              stem: q.stem,
              options: q.options,
              answer_index: q.answer,
              explanation: q.explanation,
              tier: q.tier || 2,
              format: q.format || "single-factual",
              exams: ["capf"],
              source_type: "ca",
              source_meta: { date: today.slice(0, 10), source: d.source_name },
              status: "draft",
              attempts_count: 0,
              correct_count: 0,
            }),
          });
          qIds.push(created.id);
        }
        await pb("/api/collections/ca_items/records", token, {
          method: "POST",
          body: JSON.stringify({
            date: today,
            headline: d.headline,
            summary: d.summary,
            source_name: d.source_name,
            source_url: d.source_url,
            linked_topics: d.linked_topics,
            status: "draft",
            quiz_question_ids: qIds,
            confidence: d.confidence,
            category: d.category,
            exam_angle: d.exam_angle,
            dupe_score: d.dupe_score,
          }),
        });
        report.created++;
      } catch (err) {
        report.errors.push(`insert "${d.headline.slice(0, 40)}": ${err.message}`);
      }
    }
    log(`created ${report.created} draft ca_item(s)`);

    // 6. log the run — this is what alerting reads
    try {
      await pb("/api/collections/jobs_log/records", token, {
        method: "POST",
        body: JSON.stringify({
          job: "ca-pipeline",
          status: report.errors.length === 0 ? "ok" : report.created > 0 ? "partial" : "failed",
          fetched: report.fetched,
          candidates: report.candidates,
          created: report.created,
          duration_ms: Date.now() - started,
          message: report.errors.length ? report.errors[0].slice(0, 200) : `${report.created} drafts awaiting review`,
          detail: report,
        }),
      });
    } catch (err) {
      log(`jobs_log write failed: ${err.message}`);
    }
  }

  log(
    `done in ${Date.now() - started}ms — fetched ${report.fetched}, candidates ${report.candidates}, ` +
      `drafts ${drafts.length}, created ${report.created}, errors ${report.errors.length}` +
      (GROQ_API_KEY ? "" : "  [HEURISTIC MODE — no GROQ_API_KEY]")
  );
  if (report.errors.length) {
    for (const e of report.errors) log("  error:", e);
    if (report.created === 0 && !DRY_RUN) process.exit(1);
  }
  return drafts;
}

// only run when invoked directly (the helpers above are unit-tested)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    log("PIPELINE FAILED:", err.message);
    process.exit(1);
  });
}
