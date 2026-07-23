/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — mock papers (build book Prompt 11).
 *
 * CAPF marking lives in config: {correct: 2, negative: 0.667} (a wrong answer
 * costs one-third of the 2 marks). `question_ids: null` means "compose at
 * start from the live pool, syllabus-weighted" — the same record shape accepts
 * an admin-authored fixed paper later by filling question_ids, so a real
 * 125-question paper drops in without a schema change.
 *
 * Mock 01 is the free one; the rest are premium (build book: one free mock).
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("tests");

    const mocks = [
      {
        title: "Mock 01 — Full Paper",
        is_free: true,
        blurb: "Fresh · syllabus-weighted like CAPF 2025",
      },
      {
        title: "Mock 02 — Full Paper",
        is_free: false,
        blurb: "Premium · full-length rehearsal",
      },
    ];

    for (const m of mocks) {
      // idempotent: skip if a paper with this title already exists
      try {
        app.findFirstRecordByFilter("tests", "title = {:t}", { t: m.title });
        continue;
      } catch (_) {
        /* not present — create it */
      }
      const rec = new Record(col);
      rec.set("title", m.title);
      rec.set("kind", "mock");
      rec.set("config", {
        count: 125,
        duration_sec: 7200, // 2 hours
        correct: 2,
        negative: 0.667,
        blurb: m.blurb,
      });
      rec.set("question_ids", null); // composed at start from the live pool
      rec.set("is_free", m.is_free);
      rec.set("status", "live");
      app.save(rec);
    }
  },
  (app) => {
    for (const t of ["Mock 01 — Full Paper", "Mock 02 — Full Paper"]) {
      try {
        app.delete(app.findFirstRecordByFilter("tests", "title = {:t}", { t }));
      } catch (_) {
        /* absent */
      }
    }
  }
);
