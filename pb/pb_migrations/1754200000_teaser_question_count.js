/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — carry live_questions into topics_teaser too.
 *
 * 1754100000 added the count to topics_public. The reader also needs it for its
 * "Attempt quiz · N questions" CTA, and a free user on a gated topic reads the
 * TEASER row, not topics_public. Adding the same computed column here keeps the
 * reader on one code path for both entitled and teaser modes.
 *
 * Counting questions is not sensitive — it exposes a number, never a stem or an
 * answer_index — so it is safe on a fully public view.
 */
migrate(
  (app) => {
    const v = app.findCollectionByNameOrId("topics_teaser");
    v.viewQuery =
      "SELECT t.id, t.id_code, t.title, t.region, t.kind, t.book_ref, t.mcq_floor, " +
      "t.est_read_minutes, t.is_free, " +
      "substr(t.notes_md, 1, 700) AS notes_teaser, " +
      "(length(t.notes_md) > 700) AS teaser_truncated, " +
      "(SELECT COUNT(*) FROM questions q WHERE q.topic = t.id AND q.status = 'live') AS live_questions " +
      "FROM topics t WHERE t.status = 'live'";
    app.save(v);
  },
  (app) => {
    const v = app.findCollectionByNameOrId("topics_teaser");
    v.viewQuery =
      "SELECT id, id_code, title, region, kind, book_ref, mcq_floor, " +
      "est_read_minutes, is_free, " +
      "substr(notes_md, 1, 700) AS notes_teaser, " +
      "(length(notes_md) > 700) AS teaser_truncated " +
      "FROM topics WHERE status = 'live'";
    app.save(v);
  }
);
