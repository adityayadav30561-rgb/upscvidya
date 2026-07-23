/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — "appear as Anonymous Cadet" toggle (build book Prompt 10, privacy).
 *
 * The users collection is self-read only (`id = @request.auth.id`), so board
 * rows are assembled by the /api/board hook rather than a client expand. This
 * flag tells that hook to mask the display_name for OTHER viewers; the owner
 * always sees their own real name on their own row.
 *
 * The existing users update rule blocks the progression fields by name, so an
 * owner can set `anonymous` without any rule change.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new BoolField({ name: "anonymous" }));
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    try {
      users.fields.removeByName("anonymous");
      app.save(users);
    } catch (_) {
      /* absent */
    }
  }
);
