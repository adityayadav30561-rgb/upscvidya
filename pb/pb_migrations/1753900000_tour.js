/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — first-run walkthrough flag (Ustad guided tour).
 * users.tour_done — set true when the recruit finishes or skips the tour, so it
 * never replays automatically. Self-writable (a plain UX flag, not server-owned),
 * so it is NOT added to the updateRule block list.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new Field({ type: "bool", name: "tour_done" }));
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    try { users.fields.removeByName("tour_done"); } catch (_) { /* absent */ }
    app.save(users);
  }
);
