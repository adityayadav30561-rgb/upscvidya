/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — featured badges (leaderboard showcase).
 * users.featured_badges — a JSON array of up to 5 earned badge codes the user
 * chooses to show other aspirants on the battalion board's mini-profile. A plain
 * cosmetic pick, so it's self-writable (NOT added to the updateRule block list);
 * the client only offers codes the user has actually earned.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new Field({ type: "json", name: "featured_badges", maxSize: 2000 }));
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    try { users.fields.removeByName("featured_badges"); } catch (_) { /* absent */ }
    app.save(users);
  }
);
