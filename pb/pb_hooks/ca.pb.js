/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — Daily Briefing + admin validation queue (build book Prompt 13).
 *
 *   POST /api/ca/briefing  {date}                → published items for a day
 *   POST /api/ca/answer    {qid, choice}         → mini-quiz check (+XP)
 *   POST /api/ca/queue     {}                    → admin: pending drafts
 *   POST /api/ca/approve   {id, with_quiz, ...}  → admin: publish atomically
 *   POST /api/ca/reject    {id}                  → admin: reject
 *   POST /api/ca/batch     {ids}                 → admin: batch approve
 *
 * ARCHIVE GATING: free tier sees today + yesterday; premium sees everything.
 * Enforced here, not in the client — an older date returns `locked` with no
 * item payload at all.
 *
 * NOTE: PB JSVM pool isolation — helpers inlined per handler.
 */

// ----------------------------------------------------------------- briefing
routerAdd("POST", "/api/ca/briefing", (e) => {
  function asArr(v) {
    if (!v) return [];
    try {
      const s = String(v);
      if (s && s.charAt(0) === "[") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    return Array.isArray(v) ? v : [];
  }
  function istDate(ms) {
    return new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  }

  const auth = e.auth;
  const body = e.requestInfo().body || {};
  const today = istDate(Date.now());
  const date = String(body.date || today).slice(0, 10);

  const ent = require(`${__hooks}/lib/entitle.js`);
  const premium = ent.entitled(auth, { free: false });
  const yesterday = istDate(Date.now() - 86400000);
  const freeWindow = date === today || date === yesterday;

  // available dates drive the date strip / archive browser
  const dates = [];
  try {
    const rows = e.app.findRecordsByFilter("ca_items", "status = 'published'", "-date", 500, 0);
    const seen = {};
    for (const r of rows) {
      const d = String(r.get("date")).slice(0, 10);
      if (!seen[d]) { seen[d] = true; dates.push(d); }
    }
  } catch (_) { /* none */ }

  if (!premium && !freeWindow) {
    return e.json(200, {
      date, locked: true, premium: false, dates,
      message: "Older briefings are premium. Today and yesterday stay free.",
      items: [],
    });
  }

  const items = [];
  try {
    const rows = e.app.findRecordsByFilter(
      "ca_items",
      "status = 'published' && date >= {:from} && date <= {:to}",
      "-date",
      100,
      0,
      { from: date + " 00:00:00.000Z", to: date + " 23:59:59.999Z" }
    );
    for (const r of rows) {
      // per-item quiz, answers withheld until the user answers
      const qids = asArr(r.get("quiz_question_ids"));
      const quiz = [];
      for (const qid of qids) {
        try {
          const q = e.app.findRecordById("questions", qid);
          if (q.get("status") !== "live") continue;
          quiz.push({
            qid: q.get("qid"),
            stem: q.get("stem"),
            options: JSON.parse(q.get("options") || "[]"),
          });
        } catch (_) { /* retired */ }
      }

      // has this user already cleared the mini-quiz?
      let answered = 0;
      if (auth && quiz.length) {
        try {
          const mine = e.app.findRecordsByFilter(
            "attempts",
            "user = {:u} && context = 'daily_ca'",
            "",
            500,
            0,
            { u: auth.id }
          );
          const done = {};
          for (const a of mine) done[a.get("question")] = true;
          for (const qid of qids) if (done[qid]) answered++;
        } catch (_) { /* none */ }
      }

      items.push({
        id: r.id,
        date: String(r.get("date")).slice(0, 10),
        headline: r.get("headline"),
        summary: r.get("summary"),
        source_name: r.get("source_name"),
        source_url: r.get("source_url"),
        category: r.get("category") || "GOVERNANCE",
        exam_angle: r.get("exam_angle") || "",
        linked_topics: asArr(r.get("linked_topics")),
        quiz,
        quiz_answered: answered,
      });
    }
  } catch (_) { /* none */ }

  return e.json(200, { date, locked: false, premium, dates, items });
});

// ------------------------------------------------------------- quiz answer
routerAdd("POST", "/api/ca/answer", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Sign in to record briefing answers." });
  const body = e.requestInfo().body || {};
  const qid = String(body.qid || "");
  const choice = parseInt(body.choice, 10);

  let q;
  try {
    q = e.app.findFirstRecordByFilter("questions", "qid = {:q} && status = 'live'", { q: qid });
  } catch (_) {
    return e.json(404, { message: "Question not found." });
  }

  const answerIndex = q.getInt("answer_index");
  const isCorrect = choice === answerIndex;

  // first answer only — no XP farming on the briefing
  let already = false;
  try {
    e.app.findFirstRecordByFilter(
      "attempts",
      "user = {:u} && question = {:q} && context = 'daily_ca'",
      { u: auth.id, q: q.id }
    );
    already = true;
  } catch (_) { already = false; }

  if (!already) {
    try {
      const col = e.app.findCollectionByNameOrId("attempts");
      const att = new Record(col);
      att.set("user", auth.id);
      att.set("question", q.id);
      att.set("topic", q.get("topic"));
      att.set("context", "daily_ca");
      att.set("chosen_index", choice);
      att.set("is_correct", isCorrect);
      att.set("time_taken_ms", parseInt(body.ms, 10) || 0);
      att.set("attempted_at", new Date().toISOString().replace("T", " "));
      e.app.save(att);
    } catch (err) {
      e.app.logger().error("ca attempt", "err", String(err));
    }

    // missed CA questions rotate into the revision stack (design note)
    if (!isCorrect) {
      try {
        let dup = null;
        try {
          dup = e.app.findFirstRecordByFilter("sr_cards", "user = {:u} && question = {:q}", { u: auth.id, q: q.id });
        } catch (_) { dup = null; }
        if (!dup) {
          const srCol = e.app.findCollectionByNameOrId("sr_cards");
          const card = new Record(srCol);
          card.set("user", auth.id);
          card.set("question", q.id);
          card.set("ease", 2.5);
          card.set("interval_days", 0);
          card.set("reps", 0);
          card.set("due_date", new Date().toISOString().slice(0, 10) + " 00:00:00.000Z");
          card.set("lapses", 0);
          card.set("suspended", false);
          e.app.save(card);
        }
      } catch (err) {
        e.app.logger().error("ca sr_card", "err", String(err));
      }
    }
  }

  return e.json(200, {
    qid,
    correct_index: answerIndex,
    is_correct: isCorrect,
    explanation: q.get("explanation"),
    already,
  });
});

// -------------------------------------------------- daily briefing complete
routerAdd("POST", "/api/ca/complete", (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Authentication required." });
  const xp = require(`${__hooks}/lib/xp.js`);

  // 30 XP for the day's briefing, once per IST day
  const today = xp.istDate(Date.now());
  let already = false;
  try {
    const rows = e.app.findRecordsByFilter(
      "xp_events",
      "user = {:u} && reason = 'daily_ca'",
      "-created",
      5,
      0,
      { u: auth.id }
    );
    for (const r of rows) {
      if (xp.istDate(Date.parse(String(r.get("created")).replace(" ", "T"))) === today) already = true;
    }
  } catch (_) { already = false; }

  if (already) return e.json(200, { xp_awarded: 0, already: true });

  const res = xp.awardXP(e.app, auth.id, 30, "daily_ca");
  const streak = xp.applyStreak(e.app, auth.id); // a CA quiz qualifies the day
  return e.json(200, {
    xp_awarded: 30,
    already: false,
    xp_total: res.xpTotal,
    rank_up: res.rankUp,
    streak: streak ? { current: streak.current, counted: streak.counted } : null,
  });
});

/* =========================== ADMIN VALIDATION QUEUE ======================= */

// -------------------------------------------------------------------- queue
routerAdd("POST", "/api/ca/queue", (e) => {
  function asArr(v) {
    if (!v) return [];
    try {
      const s = String(v);
      if (s && s.charAt(0) === "[") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    return Array.isArray(v) ? v : [];
  }

  const auth = e.auth;
  if (!auth || auth.get("role") !== "admin") return e.json(403, { message: "Admins only." });

  // CA drafts
  const ca = [];
  try {
    const rows = e.app.findRecordsByFilter("ca_items", "status = 'draft'", "-created", 100, 0);
    for (const r of rows) {
      const qids = asArr(r.get("quiz_question_ids"));
      const questions = [];
      for (const qid of qids) {
        try {
          const q = e.app.findRecordById("questions", qid);
          questions.push({
            id: q.id, qid: q.get("qid"), stem: q.get("stem"),
            options: JSON.parse(q.get("options") || "[]"),
            answer_index: q.getInt("answer_index"),
            explanation: q.get("explanation"), tier: q.getInt("tier"),
            status: q.get("status"),
          });
        } catch (_) { /* missing */ }
      }
      ca.push({
        id: r.id,
        headline: r.get("headline"),
        summary: r.get("summary"),
        source_name: r.get("source_name"),
        source_url: r.get("source_url"),
        category: r.get("category") || "",
        confidence: r.getFloat("confidence"),
        exam_angle: r.get("exam_angle") || "",
        linked_topics: asArr(r.get("linked_topics")),
        dupe_score: r.getFloat("dupe_score"),
        dupe_of: r.get("dupe_of") || "",
        questions,
      });
    }
  } catch (_) { /* none */ }

  // standalone draft MCQs (ingestion / AI drafts, not attached to a CA item)
  const mcq = [];
  try {
    const attached = {};
    for (const item of ca) for (const q of item.questions) attached[q.id] = true;
    const rows = e.app.findRecordsByFilter("questions", "status = 'draft'", "-created", 100, 0);
    for (const q of rows) {
      if (attached[q.id]) continue;
      let topic = "";
      try { topic = e.app.findRecordById("topics", q.get("topic")).get("title"); } catch (_) { /* orphan */ }
      mcq.push({
        id: q.id, qid: q.get("qid"), stem: q.get("stem"),
        options: JSON.parse(q.get("options") || "[]"),
        answer_index: q.getInt("answer_index"),
        explanation: q.get("explanation"), tier: q.getInt("tier"),
        topic_title: topic, source_type: q.get("source_type"),
      });
    }
  } catch (_) { /* none */ }

  // naive dupe detection across draft stems vs live pool
  for (const d of mcq) {
    const words = String(d.stem).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3);
    let best = 0, bestQid = "";
    try {
      const live = e.app.findRecordsByFilter("questions", "status = 'live'", "", 1000, 0);
      for (const l of live) {
        const lw = String(l.get("stem")).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3);
        const set = {};
        for (const w of lw) set[w] = true;
        let inter = 0;
        for (const w of words) if (set[w]) inter++;
        const union = words.length + lw.length - inter;
        const score = union > 0 ? inter / union : 0;
        if (score > best) { best = score; bestQid = l.get("qid"); }
      }
    } catch (_) { /* none */ }
    d.dupe_score = Math.round(best * 100) / 100;
    d.dupe_of = best >= 0.7 ? bestQid : "";
  }

  return e.json(200, {
    ca,
    mcq,
    flagged: mcq.filter((m) => m.dupe_of),
    counts: { ca: ca.length, mcq: mcq.length, flagged: mcq.filter((m) => m.dupe_of).length },
  });
});

// ------------------------------------------------------------------ approve
routerAdd("POST", "/api/ca/approve", (e) => {
  function asArr(v) {
    if (!v) return [];
    try {
      const s = String(v);
      if (s && s.charAt(0) === "[") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    return Array.isArray(v) ? v : [];
  }

  const auth = e.auth;
  if (!auth || auth.get("role") !== "admin") return e.json(403, { message: "Admins only." });
  const body = e.requestInfo().body || {};
  const withQuiz = body.with_quiz !== false;

  let item;
  try {
    item = e.app.findRecordById("ca_items", String(body.id || ""));
  } catch (_) {
    return e.json(404, { message: "Item not found." });
  }

  // publish today, or schedule 07:00 tomorrow when approved after 20:00 IST
  const nowIst = new Date(Date.now() + 5.5 * 3600 * 1000);
  const hour = nowIst.getUTCHours();
  const publish = new Date(nowIst.getTime());
  if (hour >= 20) publish.setUTCDate(publish.getUTCDate() + 1);
  const publishDate = publish.toISOString().slice(0, 10) + " 00:00:00.000Z";

  // inline edits from the queue land with the approval
  if (body.summary !== undefined) item.set("summary", String(body.summary));
  if (body.headline !== undefined) item.set("headline", String(body.headline));
  if (Array.isArray(body.linked_topics)) item.set("linked_topics", body.linked_topics);

  const qids = asArr(item.get("quiz_question_ids"));
  const published = [];

  // ATOMIC: the item and its questions flip together, or neither does
  e.app.runInTransaction((txApp) => {
    if (withQuiz) {
      for (const qid of qids) {
        try {
          const q = txApp.findRecordById("questions", qid);
          q.set("status", "live");
          txApp.save(q);
          published.push(qid);
        } catch (err) {
          throw new Error(`question ${qid}: ${err}`);
        }
      }
    } else {
      // "approve item without quiz" — drafts stay drafts, item ships bare
      item.set("quiz_question_ids", []);
    }
    item.set("status", "published");
    item.set("date", publishDate);
    item.set("reviewed_by", auth.id);
    item.set("reviewed_at", new Date().toISOString().replace("T", " "));
    txApp.save(item);
  });

  return e.json(200, {
    id: item.id,
    status: "published",
    publish_date: publishDate.slice(0, 10),
    scheduled: hour >= 20,
    questions_published: published.length,
  });
});

// ------------------------------------------------------------------- reject
routerAdd("POST", "/api/ca/reject", (e) => {
  const auth = e.auth;
  if (!auth || auth.get("role") !== "admin") return e.json(403, { message: "Admins only." });
  const body = e.requestInfo().body || {};

  // a rejected MCQ draft retires; a rejected CA item is marked rejected
  if (body.question_id) {
    try {
      const q = e.app.findRecordById("questions", String(body.question_id));
      q.set("status", "retired");
      e.app.save(q);
      return e.json(200, { question_id: q.id, status: "retired" });
    } catch (_) {
      return e.json(404, { message: "Question not found." });
    }
  }

  let item;
  try {
    item = e.app.findRecordById("ca_items", String(body.id || ""));
  } catch (_) {
    return e.json(404, { message: "Item not found." });
  }
  item.set("status", "rejected");
  item.set("reviewed_by", auth.id);
  item.set("reviewed_at", new Date().toISOString().replace("T", " "));
  e.app.save(item);
  return e.json(200, { id: item.id, status: "rejected" });
});

// ---------------------------------------------------------- publish an MCQ
routerAdd("POST", "/api/ca/publish-question", (e) => {
  const auth = e.auth;
  if (!auth || auth.get("role") !== "admin") return e.json(403, { message: "Admins only." });
  const body = e.requestInfo().body || {};

  let q;
  try {
    q = e.app.findRecordById("questions", String(body.question_id || ""));
  } catch (_) {
    return e.json(404, { message: "Question not found." });
  }
  if (body.stem !== undefined) q.set("stem", String(body.stem));
  if (Array.isArray(body.options) && body.options.length === 4) q.set("options", body.options);
  if (body.answer_index !== undefined) q.set("answer_index", parseInt(body.answer_index, 10));
  if (body.explanation !== undefined) q.set("explanation", String(body.explanation));
  q.set("status", "live");
  e.app.save(q);
  return e.json(200, { question_id: q.id, status: "live" });
});

// ------------------------------------------------------------ batch approve
routerAdd("POST", "/api/ca/batch", (e) => {
  const auth = e.auth;
  if (!auth || auth.get("role") !== "admin") return e.json(403, { message: "Admins only." });
  const body = e.requestInfo().body || {};
  const ids = Array.isArray(body.ids) ? body.ids : [];
  const minConfidence = body.min_confidence === undefined ? 0.92 : Number(body.min_confidence);

  const nowIst = new Date(Date.now() + 5.5 * 3600 * 1000);
  const publish = new Date(nowIst.getTime());
  if (nowIst.getUTCHours() >= 20) publish.setUTCDate(publish.getUTCDate() + 1);
  const publishDate = publish.toISOString().slice(0, 10) + " 00:00:00.000Z";

  const done = [], skipped = [];
  for (const id of ids) {
    try {
      const item = e.app.findRecordById("ca_items", String(id));
      // batch approve is for LOW-RISK items only — anything less confident
      // must be opened and read
      if (item.getFloat("confidence") < minConfidence) {
        skipped.push({ id, reason: "below confidence threshold" });
        continue;
      }
      e.app.runInTransaction((txApp) => {
        let qids = item.get("quiz_question_ids");
        try { qids = JSON.parse(String(qids)); } catch (_) { qids = []; }
        for (const qid of qids || []) {
          try {
            const q = txApp.findRecordById("questions", qid);
            q.set("status", "live");
            txApp.save(q);
          } catch (_) { /* skip missing */ }
        }
        item.set("status", "published");
        item.set("date", publishDate);
        item.set("reviewed_by", auth.id);
        item.set("reviewed_at", new Date().toISOString().replace("T", " "));
        txApp.save(item);
      });
      done.push(id);
    } catch (err) {
      skipped.push({ id, reason: String(err).slice(0, 120) });
    }
  }
  return e.json(200, { approved: done.length, skipped, publish_date: publishDate.slice(0, 10) });
});
