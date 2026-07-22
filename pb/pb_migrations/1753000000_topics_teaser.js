/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — topics_teaser view (build book Prompt 06, point 4).
 *
 * The reader must show free users a ~120-word teaser of a premium topic and
 * then a paywall — WITHOUT ever shipping the full notes_md. The `topics`
 * collection is all-or-nothing (entitlement-gated), so a free user opening a
 * gated topic gets 403 and no preview at all.
 *
 * This public view server-trims notes_md to its first ~700 characters for
 * every live topic. The reader reads the entitled full record when allowed and
 * falls back to this teaser otherwise, so the trimmed text is enforced in SQL —
 * the network response for a gated topic can only ever contain the teaser.
 */
migrate(
  (app) => {
    const teaser = new Collection({
      type: "view",
      name: "topics_teaser",
      // substr trims server-side; teaser_truncated tells the client whether to
      // draw the paywall fade (any topic longer than the cut is truncated).
      viewQuery:
        "SELECT id, id_code, title, region, kind, book_ref, mcq_floor, " +
        "est_read_minutes, is_free, " +
        "substr(notes_md, 1, 700) AS notes_teaser, " +
        "(length(notes_md) > 700) AS teaser_truncated " +
        "FROM topics WHERE status = 'live'",
      listRule: "",
      viewRule: "",
    });
    app.save(teaser);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("topics_teaser"));
    } catch (_) {
      /* absent */
    }
  }
);
