/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — real question counts on the public topic view.
 *
 * The map sheet, home card and reader CTA all need "how many questions does this
 * territory actually have?". They were showing `mcq_floor`, which is an AUTHORING
 * TARGET (the minimum pool a chapter must eventually carry), not a count — so a
 * chapter with 50 authored questions advertised its floor of 35, and one with 4
 * advertised 20.
 *
 * `questions` is deliberately not client-listable (the whole quiz-integrity
 * design depends on that), so the client cannot count them itself. A view column
 * is the right place: it is computed server-side in SQL, costs no extra request,
 * and cannot leak stems or answers.
 *
 * live_questions counts only `status = 'live'` rows — the same set the quiz
 * engine composes from — so the number on the button is exactly what the user
 * will be served.
 */
const VIEW_FIELDS =
  "t.id, t.id_code, t.title, t.part_no, t.region, t.kind, t.book_ref, t.mcq_floor, " +
  "t.tags, t.guided_order, t.est_read_minutes, t.prerequisites, t.status, t.is_free";

const COUNT_COL =
  "(SELECT COUNT(*) FROM questions q WHERE q.topic = t.id AND q.status = 'live') AS live_questions";

migrate(
  (app) => {
    const v = app.findCollectionByNameOrId("topics_public");
    v.viewQuery = `SELECT ${VIEW_FIELDS}, ${COUNT_COL} FROM topics t WHERE t.status = 'live'`;
    app.save(v);
  },
  (app) => {
    const v = app.findCollectionByNameOrId("topics_public");
    v.viewQuery =
      "SELECT id, id_code, title, part_no, region, kind, book_ref, mcq_floor, " +
      "tags, guided_order, est_read_minutes, prerequisites, status, is_free " +
      "FROM topics WHERE status = 'live'";
    app.save(v);
  }
);
