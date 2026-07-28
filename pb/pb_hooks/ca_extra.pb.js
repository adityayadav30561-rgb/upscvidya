/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — CA manual ingestion + Monthly Current Affairs (extends Prompt 13).
 *
 *   POST /api/ca/compose        {date?, raw?, items?}   admin → draft ca_items
 *   POST /api/ca/monthly-index  {}                      months with CA MCQs
 *   POST /api/ca/monthly-start  {month}                 compile month's MCQs → test
 *
 * MANUAL INGEST: the admin pastes a day's raw current-affairs notes. With an AI
 * key set (OPENROUTER_API_KEY, else GROQ_API_KEY — both OpenAI-compatible, so
 * only base URL + model + key differ), the model turns the text into briefs
 * (60-90w) + 2-3 MCQs
 * each, tagged to POL topics — same shape the RSS pipeline produces, dropped
 * straight into the existing admin queue as `draft`. Without a key, the admin
 * can post a pre-structured `items` array instead (hand-authored). NOTHING goes
 * live without human approval in the queue.
 *
 * MONTHLY CA: every published daily briefing's live MCQs, unioned across a
 * calendar month, become one practice test through the standard test engine.
 * Current IST month is free to sample; older months are premium (entitle.js).
 *
 * NOTE: PB JSVM pool isolation — helpers inlined per handler.
 */

// ------------------------------------------------------------------ compose
routerAdd("POST", "/api/ca/compose", (e) => {
  function asObj(v) {
    if (!v) return {};
    try { const s = String(v); if (s && s.charAt(0) === "{") return JSON.parse(s); } catch (_) { /* */ }
    return typeof v === "object" ? v : {};
  }

  const auth = e.auth;
  if (!auth || auth.get("role") !== "admin") return e.json(403, { message: "Admins only." });
  const body = e.requestInfo().body || {};
  const rawText = String(body.raw || "").trim();
  const manualItems = Array.isArray(body.items) ? body.items : null;
  const date = (String(body.date || "").slice(0, 10)) || new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

  if (!rawText && !manualItems) return e.json(400, { message: "Provide raw text or an items array." });

  // live POL taxonomy for topic tagging + resolving topic ids
  const topicById = {};
  const topicByCode = {};
  try {
    const rows = e.app.findRecordsByFilter("topics", "status = 'live'", "", 500, 0);
    for (const t of rows) {
      const info = { id: t.id, code: t.get("id_code"), title: t.get("title") };
      topicById[t.id] = info;
      topicByCode[info.code] = info;
    }
  } catch (_) { /* none */ }

  let items = manualItems;

  // --- AI path: turn raw notes into structured items via the LLM ---
  if (!items) {
    const env = (n) => (typeof $os !== "undefined" && $os.getenv ? $os.getenv(n) : "");
    // All three speak the OpenAI chat-completions shape — only base URL, model
    // and key differ. First with a key wins; AI_PROVIDER forces one.
    const candidates = [
      {
        name: "openrouter",
        key: env("OPENROUTER_API_KEY"),
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: env("OPENROUTER_MODEL") || "nvidia/nemotron-3-ultra-550b-a55b:free",
        extraHeaders: { "http-referer": "https://upscvidya.app", "x-title": "UPSCVidya" },
      },
      {
        name: "gemini",
        key: env("GEMINI_API_KEY"),
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        model: env("GEMINI_MODEL") || "gemini-3.6-flash",
        extraHeaders: {},
      },
      {
        name: "mistral",
        key: env("MISTRAL_API_KEY"),
        url: "https://api.mistral.ai/v1/chat/completions",
        model: env("MISTRAL_MODEL") || "mistral-large-latest",
        extraHeaders: {},
      },
      {
        name: "opencode",
        key: env("OPENCODE_API_KEY"),
        url: "https://opencode.ai/zen/v1/chat/completions",
        model: env("OPENCODE_MODEL") || "deepseek-v4-flash-free",
        extraHeaders: {},
      },
      {
        name: "groq",
        key: env("GROQ_API_KEY"),
        url: "https://api.groq.com/openai/v1/chat/completions",
        model: env("GROQ_MODEL") || "llama-3.3-70b-versatile",
        extraHeaders: {},
      },
    ];
    const forced = String(env("AI_PROVIDER") || "").trim().toLowerCase();
    // Failover chain: every configured provider, in order (AI_PROVIDER pins one).
    const chain = candidates.filter((c) => c.key && (!forced || c.name === forced));
    if (!chain.length) {
      return e.json(422, {
        message: "No AI key on the server (OPENROUTER_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY or GROQ_API_KEY). Set one to auto-draft, or POST a structured `items` array.",
        need_key: true,
      });
    }
    const taxonomy = Object.keys(topicByCode).map((c) => `${c} ${topicByCode[c].title}`).join("\n");
    const prompt = `You are preparing CAPF Assistant Commandant current-affairs material.
From the admin's raw notes below, produce distinct briefing items. Each item:
- headline: crisp, factual
- summary: 60-90 words, your own wording, exam-relevant
- category: one of POLITY | SECURITY | ECONOMY | GOVERNANCE
- linked_topics: 1-3 codes chosen ONLY from the topic list
- exam_angle: one line on how it could be asked
- questions: 2-3 MCQs, each { stem, options:[4 strings], answer:0-3, explanation, tier:1-3 }

Topic list:
${taxonomy}

Raw notes:
${rawText.slice(0, 8000)}

Return JSON: { "items": [ ... ] }`;

    // Inlined (JSVM isolation): pull a JSON object out of a reply that may carry
    // reasoning traces or fences — the default model reasons, and the provider
    // is not guaranteed to honour response_format. Brace-balanced.
    const extractJson = (raw) => {
      let s = String(raw == null ? "" : raw);
      s = s.replace(/<think>[\s\S]*?<\/think>/gi, " ");
      const stray = s.lastIndexOf("</think>");
      if (stray !== -1) s = s.slice(stray + 8);
      s = s.replace(/```(?:json)?/gi, " ");
      const start = s.indexOf("{");
      if (start === -1) throw new Error("no JSON object in model output");
      let depth = 0, inStr = false, esc = false;
      for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (esc) { esc = false; continue; }
        if (c === "\\") { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === "{") depth++;
        else if (c === "}" && --depth === 0) return JSON.parse(s.slice(start, i + 1));
      }
      throw new Error("unbalanced JSON in model output");
    };

    // Try each configured provider in turn — an admin paste must not fail just
    // because the first provider's daily quota is gone.
    let parsed = null;
    const failures = [];
    for (const cand of chain) {
      const headers = { "content-type": "application/json", authorization: "Bearer " + cand.key };
      for (const h in cand.extraHeaders) headers[h] = cand.extraHeaders[h];
      try {
        const res = $http.send({
          url: cand.url,
          method: "POST",
          headers: headers,
          body: JSON.stringify({
            model: cand.model,
            response_format: { type: "json_object" },
            temperature: 0.2,
            messages: [
              { role: "system", content: "Reply with JSON only. Summaries factual and original." },
              { role: "user", content: prompt },
            ],
          }),
          // a reasoning model on a free endpoint is slow — do not lower this
          timeout: 180,
        });
        if (res.statusCode < 200 || res.statusCode >= 300) {
          failures.push(cand.name + " HTTP " + res.statusCode);
          continue;
        }
        const data = JSON.parse(String(res.body));
        const msg = data.choices[0].message || {};
        parsed = extractJson(msg.content || msg.reasoning || "");
        break;
      } catch (err) {
        failures.push(cand.name + ": " + String(err).slice(0, 80));
      }
    }
    if (!parsed) {
      return e.json(502, { message: "Every AI provider failed — " + failures.join(" | ").slice(0, 300) });
    }
    items = Array.isArray(parsed.items) ? parsed.items : [];
  }

  if (!items.length) return e.json(422, { message: "No items produced from that input." });

  // insert each item + its draft questions
  const qCol = e.app.findCollectionByNameOrId("questions");
  const caCol = e.app.findCollectionByNameOrId("ca_items");
  let created = 0;
  const detail = [];

  for (const it of items) {
    const codes = (Array.isArray(it.linked_topics) ? it.linked_topics : [])
      .filter((c) => topicByCode[c])
      .slice(0, 3);
    const primaryTopicId = codes.length ? topicByCode[codes[0]].id : null;
    if (!primaryTopicId) {
      detail.push({ headline: String(it.headline || "").slice(0, 60), skipped: "no valid linked topic" });
      continue;
    }

    const qids = [];
    const questions = Array.isArray(it.questions) ? it.questions : [];
    for (const q of questions) {
      if (!Array.isArray(q.options) || q.options.length !== 4) continue;
      if (!(q.answer >= 0 && q.answer <= 3)) continue;
      try {
        const rec = new Record(qCol);
        rec.set("qid", "CA-" + Date.now() + "-" + qids.length + "-" + Math.floor(Math.random() * 1000));
        rec.set("topic", primaryTopicId);
        rec.set("stem", String(q.stem || ""));
        rec.set("options", q.options.map((o) => String(o)));
        rec.set("answer_index", parseInt(q.answer, 10));
        rec.set("explanation", String(q.explanation || ""));
        rec.set("tier", Math.min(3, Math.max(1, parseInt(q.tier, 10) || 2)));
        rec.set("format", "single-factual");
        rec.set("exams", ["capf"]);
        rec.set("source_type", "ca");
        rec.set("source_meta", { date, source: "manual" });
        rec.set("status", "draft");
        rec.set("attempts_count", 0);
        rec.set("correct_count", 0);
        e.app.save(rec);
        qids.push(rec.id);
      } catch (err) {
        e.app.logger().error("ca compose q", "err", String(err));
      }
    }

    try {
      const rec = new Record(caCol);
      rec.set("date", date + " 00:00:00.000Z");
      rec.set("headline", String(it.headline || "Untitled"));
      rec.set("summary", String(it.summary || ""));
      rec.set("source_name", String(it.source_name || "Editorial"));
      rec.set("source_url", String(it.source_url || ""));
      rec.set("linked_topics", codes);
      rec.set("status", "draft");
      rec.set("quiz_question_ids", qids);
      rec.set("confidence", 0.6); // manual/AI draft — below batch-approve bar
      rec.set("category", String(it.category || "GOVERNANCE").toUpperCase());
      rec.set("exam_angle", String(it.exam_angle || ""));
      rec.set("dupe_score", 0);
      e.app.save(rec);
      created++;
      detail.push({ headline: rec.get("headline").slice(0, 60), questions: qids.length });
    } catch (err) {
      e.app.logger().error("ca compose item", "err", String(err));
    }
  }

  return e.json(200, { created, date, detail, mode: manualItems ? "manual" : "ai" });
});

// ------------------------------------------------------------- monthly index
routerAdd("POST", "/api/ca/monthly-index", (e) => {
  function asArr(v) {
    if (!v) return [];
    try { const s = String(v); if (s && s.charAt(0) === "[") return JSON.parse(s); } catch (_) { /* */ }
    return Array.isArray(v) ? v : [];
  }

  const auth = e.auth;
  const nowIst = new Date(Date.now() + 5.5 * 3600 * 1000);
  const currentMonth = nowIst.toISOString().slice(0, 7); // YYYY-MM

  const months = {};
  try {
    const rows = e.app.findRecordsByFilter("ca_items", "status = 'published'", "-date", 1000, 0);
    for (const r of rows) {
      const day = String(r.get("date")).slice(0, 10);
      const month = day.slice(0, 7);
      if (!months[month]) months[month] = { month, items: 0, qids: {} };
      months[month].items++;
      for (const qid of asArr(r.get("quiz_question_ids"))) months[month].qids[qid] = true;
    }
  } catch (_) { /* none */ }

  // count LIVE questions per month + this user's attempts
  const attempted = {};
  if (auth) {
    try {
      const mine = e.app.findRecordsByFilter("attempts", "user = {:u} && context = 'daily_ca'", "", 5000, 0, { u: auth.id });
      for (const a of mine) attempted[a.get("question")] = true;
    } catch (_) { /* none */ }
  }

  const list = [];
  for (const key of Object.keys(months)) {
    const m = months[key];
    let liveCount = 0, done = 0;
    for (const qid of Object.keys(m.qids)) {
      try {
        const q = e.app.findRecordById("questions", qid);
        if (q.get("status") !== "live") continue;
        liveCount++;
        if (attempted[qid]) done++;
      } catch (_) { /* retired */ }
    }
    if (liveCount === 0) continue;
    list.push({
      month: key,
      items: m.items,
      questions: liveCount,
      attempted: done,
      is_current: key === currentMonth,
    });
  }
  list.sort((a, b) => (a.month < b.month ? 1 : -1));

  return e.json(200, { months: list, current_month: currentMonth });
});

// ------------------------------------------------------------- monthly start
routerAdd("POST", "/api/ca/monthly-start", (e) => {
  function asArr(v) {
    if (!v) return [];
    try { const s = String(v); if (s && s.charAt(0) === "[") return JSON.parse(s); } catch (_) { /* */ }
    return Array.isArray(v) ? v : [];
  }
  function isSet(v) { return String(v || "").trim() !== ""; }

  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Sign in to practise the monthly set." });
  const body = e.requestInfo().body || {};
  const month = String(body.month || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return e.json(400, { message: "month must be YYYY-MM." });

  const nowIst = new Date(Date.now() + 5.5 * 3600 * 1000);
  const currentMonth = nowIst.toISOString().slice(0, 7);

  // entitlement: current month free to sample; older months are premium
  if (month !== currentMonth) {
    const ent = require(`${__hooks}/lib/entitle.js`);
    if (!ent.entitled(auth, { free: false })) {
      return e.json(403, { code: "premium_required", message: "Monthly archives are premium." });
    }
  }

  // union of every LIVE CA question published that month
  const seen = {};
  const picked = [];
  try {
    const from = month + "-01 00:00:00.000Z";
    const to = month + "-31 23:59:59.999Z";
    const rows = e.app.findRecordsByFilter(
      "ca_items",
      "status = 'published' && date >= {:from} && date <= {:to}",
      "date",
      1000,
      0,
      { from, to }
    );
    for (const r of rows) {
      for (const qid of asArr(r.get("quiz_question_ids"))) {
        if (seen[qid]) continue;
        seen[qid] = true;
        try {
          const q = e.app.findRecordById("questions", qid);
          if (q.get("status") === "live") picked.push(q.id);
        } catch (_) { /* retired */ }
      }
    }
  } catch (_) { /* none */ }

  if (picked.length === 0) return e.json(422, { message: "No current-affairs MCQs published for that month yet." });

  const title = "Monthly CA — " + month;
  let test = null;
  try { test = e.app.findFirstRecordByFilter("tests", "title = {:t}", { t: title }); } catch (_) { test = null; }
  if (!test) {
    const col = e.app.findCollectionByNameOrId("tests");
    test = new Record(col);
    test.set("title", title);
    test.set("kind", "mock");
    test.set("status", "live");
  }
  // refresh config on every start so duration/count track the month's growth.
  // Practice, not an exam: +1 per correct, NO negative, a generous 2-min budget
  // per question so a revision session is never rushed.
  test.set("config", {
    count: picked.length,
    duration_sec: picked.length * 120,
    correct: 1,
    negative: 0,
    blurb: "Monthly current affairs",
  });
  test.set("question_ids", picked);
  test.set("is_free", month === currentMonth);
  e.app.save(test);

  // resume an open attempt rather than stacking
  try {
    const open = e.app.findFirstRecordByFilter(
      "test_attempts",
      "user = {:u} && test = {:t} && submitted_at = ''",
      { u: auth.id, t: test.id }
    );
    if (open && !isSet(open.get("submitted_at"))) return e.json(200, { attempt_id: open.id, test_id: test.id, resumed: true });
  } catch (_) { /* none */ }

  const attemptsCol = e.app.findCollectionByNameOrId("test_attempts");
  const attempt = new Record(attemptsCol);
  attempt.set("user", auth.id);
  attempt.set("test", test.id);
  attempt.set("started_at", new Date().toISOString().replace("T", " "));
  attempt.set("answers", {});
  attempt.set("palette_state", { qids: picked });
  attempt.set("score", 0);
  attempt.set("max_score", picked.length);
  e.app.save(attempt);

  return e.json(200, { attempt_id: attempt.id, test_id: test.id, resumed: false, count: picked.length });
});
