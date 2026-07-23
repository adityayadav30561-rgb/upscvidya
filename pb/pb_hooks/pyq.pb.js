/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — PYQ Vault (build book Prompt 12). Fully free, the acquisition hook.
 *
 *   POST /api/pyq/index  {}                  → years + topic breakdown (PUBLIC)
 *   POST /api/pyq/paper  {year}              → one paper's questions  (PUBLIC)
 *   POST /api/pyq/check  {qid, choice}       → verdict + explanation  (PUBLIC)
 *   POST /api/pyq/attempt-paper {year}       → full paper through the test engine (auth)
 *
 * PUBLIC BY DESIGN: the `questions` collection is admin-listable only, so these
 * endpoints are the sole public surface. They are deliberately open — a
 * logged-out visitor must be able to browse and attempt PYQs (build book
 * acceptance). Only PYQs (`source_type = 'pyq'`) are ever served here; the
 * paid question bank stays behind the authenticated quiz/test engines.
 *
 * /paper never includes answer_index or explanation; /check reveals them for a
 * single question at a time, which is the inline-practice contract.
 *
 * NOTE: PB JSVM pool isolation — helpers inlined per handler.
 */

// -------------------------------------------------------------------- index
routerAdd("POST", "/api/pyq/index", (e) => {
  function asObj(v) {
    if (!v) return {};
    try {
      const s = String(v);
      if (s && s.charAt(0) === "{") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    return typeof v === "object" ? v : {};
  }

  let qs = [];
  try {
    qs = e.app.findRecordsByFilter(
      "questions",
      "source_type = 'pyq' && status = 'live'",
      "",
      5000,
      0
    );
  } catch (_) { qs = [] ; }

  const byYear = {};
  const byTopic = {};
  const topicMeta = {};

  for (const q of qs) {
    const meta = asObj(q.get("source_meta"));
    const year = String(meta.year || "");
    const exam = String(meta.exam || "CAPF");
    if (year) {
      const key = exam + "-" + year;
      if (!byYear[key]) byYear[key] = { exam, year: Number(year), count: 0, topics: {} };
      byYear[key].count++;
    }

    const tid = q.get("topic");
    if (tid) {
      if (!topicMeta[tid]) {
        try {
          const t = e.app.findRecordById("topics", tid);
          topicMeta[tid] = { code: t.get("id_code"), title: t.get("title"), region: t.get("region") };
        } catch (_) {
          topicMeta[tid] = { code: "", title: "", region: "" };
        }
      }
      const code = topicMeta[tid].code;
      if (code) {
        if (!byTopic[code]) byTopic[code] = { code, title: topicMeta[tid].title, region: topicMeta[tid].region, count: 0 };
        byTopic[code].count++;
        if (year) {
          const key = exam + "-" + year;
          byYear[key].topics[code] = (byYear[key].topics[code] || 0) + 1;
        }
      }
    }
  }

  // per-user attempt progress (optional — the vault works logged out)
  const auth = e.auth;
  const attemptedByYear = {};
  let attemptedTotal = 0, correctTotal = 0;
  if (auth) {
    try {
      const mine = e.app.findRecordsByFilter(
        "attempts",
        "user = {:u} && context = 'pyq'",
        "",
        5000,
        0,
        { u: auth.id }
      );
      const seen = {};
      for (const a of mine) {
        const qidRec = a.get("question");
        if (seen[qidRec]) continue; // count distinct questions attempted
        seen[qidRec] = true;
        attemptedTotal++;
        if (a.getBool("is_correct")) correctTotal++;
        try {
          const q = e.app.findRecordById("questions", qidRec);
          const meta = asObj(q.get("source_meta"));
          const key = String(meta.exam || "CAPF") + "-" + String(meta.year || "");
          attemptedByYear[key] = (attemptedByYear[key] || 0) + 1;
        } catch (_) { /* retired */ }
      }
    } catch (_) { /* none */ }
  }

  const years = Object.keys(byYear)
    .map((k) => ({
      key: k,
      exam: byYear[k].exam,
      year: byYear[k].year,
      count: byYear[k].count,
      topic_count: Object.keys(byYear[k].topics).length,
      attempted: attemptedByYear[k] || 0,
    }))
    .sort((a, b) => b.year - a.year);

  const topics = Object.keys(byTopic)
    .map((c) => byTopic[c])
    .sort((a, b) => b.count - a.count);

  return e.json(200, {
    years,
    topics,
    total: qs.length,
    papers: years.length,
    attempted: attemptedTotal,
    correct: correctTotal,
  });
});

// -------------------------------------------------------------------- paper
routerAdd("POST", "/api/pyq/paper", (e) => {
  function asObj(v) {
    if (!v) return {};
    try {
      const s = String(v);
      if (s && s.charAt(0) === "{") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    return typeof v === "object" ? v : {};
  }

  const body = e.requestInfo().body || {};
  const year = String(body.year || "");
  const topicCode = String(body.topic || "");
  if (!year && !topicCode) return e.json(400, { message: "year or topic is required." });

  let qs = [];
  try {
    qs = e.app.findRecordsByFilter("questions", "source_type = 'pyq' && status = 'live'", "", 5000, 0);
  } catch (_) { qs = []; }

  // recurrence: how many times this stem has been asked across papers
  const stemCounts = {};
  for (const q of qs) {
    const k = String(q.get("stem")).slice(0, 80).toLowerCase();
    stemCounts[k] = (stemCounts[k] || 0) + 1;
  }

  const auth = e.auth;
  const attemptedMap = {};
  if (auth) {
    try {
      const mine = e.app.findRecordsByFilter(
        "attempts",
        "user = {:u} && context = 'pyq'",
        "-attempted_at",
        5000,
        0,
        { u: auth.id }
      );
      for (const a of mine) {
        const k = a.get("question");
        if (attemptedMap[k] === undefined) attemptedMap[k] = a.getBool("is_correct");
      }
    } catch (_) { /* none */ }
  }

  const out = [];
  for (const q of qs) {
    const meta = asObj(q.get("source_meta"));
    let topic = { code: "", title: "" };
    try {
      const t = e.app.findRecordById("topics", q.get("topic"));
      topic = { code: t.get("id_code"), title: t.get("title") };
    } catch (_) { /* orphan */ }

    if (year && String(meta.year || "") !== year) continue;
    if (topicCode && topic.code !== topicCode) continue;

    const stemKey = String(q.get("stem")).slice(0, 80).toLowerCase();
    out.push({
      qid: q.get("qid"),
      stem: q.get("stem"),
      options: JSON.parse(q.get("options") || "[]"),
      tier: q.getInt("tier"),
      format: q.get("format"),
      topic_code: topic.code,
      topic_title: topic.title,
      exam: meta.exam || "CAPF",
      year: meta.year || null,
      qno: meta.qno === undefined ? null : meta.qno,
      asked_times: stemCounts[stemKey] || 1,
      // per-user state; null when logged out
      attempted: attemptedMap[q.id] === undefined ? null : true,
      was_correct: attemptedMap[q.id] === undefined ? null : attemptedMap[q.id],
    });
  }

  out.sort((a, b) => (a.qno || 0) - (b.qno || 0));
  return e.json(200, { year: year || null, topic: topicCode || null, questions: out });
});

// -------------------------------------------------------------------- check
routerAdd("POST", "/api/pyq/check", (e) => {
  const body = e.requestInfo().body || {};
  const qid = String(body.qid || "");
  const choice = parseInt(body.choice, 10);
  if (!qid) return e.json(400, { message: "qid is required." });

  let q;
  try {
    q = e.app.findFirstRecordByFilter(
      "questions",
      "qid = {:q} && source_type = 'pyq' && status = 'live'",
      { q: qid }
    );
  } catch (_) {
    return e.json(404, { message: "Question not found." });
  }

  const answerIndex = q.getInt("answer_index");
  const isCorrect = choice === answerIndex;

  // logged-in visitors get their attempt recorded (and wrong ones feed the
  // revision stack, same as any other miss); anonymous ones simply get the
  // verdict — the vault never hard-blocks.
  const auth = e.auth;
  if (auth && choice >= 0) {
    try {
      const col = e.app.findCollectionByNameOrId("attempts");
      const att = new Record(col);
      att.set("user", auth.id);
      att.set("question", q.id);
      att.set("topic", q.get("topic"));
      att.set("context", "pyq");
      att.set("chosen_index", choice);
      att.set("is_correct", isCorrect);
      att.set("time_taken_ms", parseInt(body.ms, 10) || 0);
      att.set("attempted_at", new Date().toISOString().replace("T", " "));
      e.app.save(att);
    } catch (err) {
      e.app.logger().error("pyq attempt", "err", String(err));
    }

    try {
      q.set("attempts_count", q.getInt("attempts_count") + 1);
      if (isCorrect) q.set("correct_count", q.getInt("correct_count") + 1);
      e.app.save(q);
    } catch (_) { /* stats best-effort */ }

    // wrong PYQ answers join the revision stack (design interaction note)
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
        e.app.logger().error("pyq sr_card", "err", String(err));
      }
    }
  }

  return e.json(200, {
    qid,
    correct_index: answerIndex,
    is_correct: isCorrect,
    explanation: q.get("explanation"),
    recorded: !!auth,
  });
});

// ------------------------------------------------------- attempt whole paper
routerAdd("POST", "/api/pyq/attempt-paper", (e) => {
  function asObj(v) {
    if (!v) return {};
    try {
      const s = String(v);
      if (s && s.charAt(0) === "{") return JSON.parse(s);
    } catch (_) { /* not stringifiable */ }
    return typeof v === "object" ? v : {};
  }
  function isSet(v) {
    return String(v || "").trim() !== "";
  }

  const auth = e.auth;
  if (!auth) return e.json(401, { message: "Sign up free to attempt a full paper." });

  const body = e.requestInfo().body || {};
  const year = String(body.year || "");
  if (!year) return e.json(400, { message: "year is required." });

  let qs = [];
  try {
    qs = e.app.findRecordsByFilter("questions", "source_type = 'pyq' && status = 'live'", "", 5000, 0);
  } catch (_) { qs = []; }

  const picked = [];
  for (const q of qs) {
    const meta = asObj(q.get("source_meta"));
    if (String(meta.year || "") === year) picked.push({ rec: q, qno: meta.qno || 0, exam: meta.exam || "CAPF" });
  }
  if (picked.length === 0) return e.json(422, { message: "No questions in that paper yet." });
  picked.sort((a, b) => a.qno - b.qno);

  const exam = picked[0].exam;
  const title = exam + " " + year + " — PYQ Paper";

  // one reusable free test record per paper
  let test = null;
  try {
    test = e.app.findFirstRecordByFilter("tests", "title = {:t}", { t: title });
  } catch (_) { test = null; }
  if (!test) {
    const col = e.app.findCollectionByNameOrId("tests");
    test = new Record(col);
    test.set("title", title);
    test.set("kind", "mock");
    test.set("config", {
      count: picked.length,
      duration_sec: picked.length * 72, // CAPF pace: 125 Q in 2 h
      correct: 2,
      negative: 0.667,
      blurb: "Past paper · free",
    });
    test.set("is_free", true);
    test.set("status", "live");
  }
  test.set("question_ids", picked.map((p) => p.rec.id));
  e.app.save(test);

  // resume an open attempt instead of stacking a second
  try {
    const open = e.app.findFirstRecordByFilter(
      "test_attempts",
      "user = {:u} && test = {:t} && submitted_at = ''",
      { u: auth.id, t: test.id }
    );
    if (open && !isSet(open.get("submitted_at"))) {
      return e.json(200, { attempt_id: open.id, test_id: test.id, resumed: true });
    }
  } catch (_) { /* none open */ }

  const attemptsCol = e.app.findCollectionByNameOrId("test_attempts");
  const attempt = new Record(attemptsCol);
  attempt.set("user", auth.id);
  attempt.set("test", test.id);
  attempt.set("started_at", new Date().toISOString().replace("T", " "));
  attempt.set("answers", {});
  attempt.set("palette_state", { qids: picked.map((p) => p.rec.id) });
  attempt.set("score", 0);
  attempt.set("max_score", picked.length * 2);
  e.app.save(attempt);

  return e.json(200, { attempt_id: attempt.id, test_id: test.id, resumed: false });
});
