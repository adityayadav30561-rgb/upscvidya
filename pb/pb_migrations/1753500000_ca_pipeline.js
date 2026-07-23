/// <reference path="../pb_data/types.d.ts" />
/**
 * UPSCVidya — current-affairs pipeline storage (build book Prompt 13).
 *
 * sources   — admin-editable RSS/URL list the pipeline pulls from.
 * jobs_log  — one row per pipeline run; failures are what alerting watches.
 *
 * Both are admin-only from the client; the pipeline writes with superuser
 * credentials from /opt/jobs.
 */
migrate(
  (app) => {
    const sources = new Collection({
      type: "base",
      name: "sources",
      fields: [
        { type: "text", name: "name", required: true },
        { type: "url", name: "url", required: true },
        {
          type: "select", name: "kind", maxSelect: 1, required: true,
          values: ["rss", "page"],
        },
        { type: "bool", name: "enabled" },
        // hint for the classifier: what this feed is usually about
        { type: "text", name: "note" },
        { type: "date", name: "last_fetched" },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      listRule: '@request.auth.role = "admin"',
      viewRule: '@request.auth.role = "admin"',
      createRule: '@request.auth.role = "admin"',
      updateRule: '@request.auth.role = "admin"',
      deleteRule: '@request.auth.role = "admin"',
      indexes: ["CREATE UNIQUE INDEX idx_sources_url ON sources (url)"],
    });
    app.save(sources);

    const jobsLog = new Collection({
      type: "base",
      name: "jobs_log",
      fields: [
        { type: "text", name: "job", required: true },
        {
          type: "select", name: "status", maxSelect: 1, required: true,
          values: ["ok", "partial", "failed"],
        },
        { type: "number", name: "fetched", onlyInt: true },
        { type: "number", name: "candidates", onlyInt: true },
        { type: "number", name: "created", onlyInt: true },
        { type: "number", name: "duration_ms", onlyInt: true },
        { type: "text", name: "message" },
        { type: "json", name: "detail", maxSize: 50000 },
        { type: "autodate", name: "ran_at", onCreate: true },
      ],
      listRule: '@request.auth.role = "admin"',
      viewRule: '@request.auth.role = "admin"',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: ["CREATE INDEX idx_jobs_log_job_ran ON jobs_log (job, ran_at)"],
    });
    app.save(jobsLog);

    // ca_items gains the fields the pipeline and queue need
    const ca = app.findCollectionByNameOrId("ca_items");
    ca.fields.add(new NumberField({ name: "confidence" })); // 0-1 classifier score
    ca.fields.add(new TextField({ name: "category" })); // POLITY / SECURITY / ECONOMY ...
    ca.fields.add(new TextField({ name: "exam_angle" }));
    ca.fields.add(new TextField({ name: "dupe_of" })); // ca_items id when near-duplicate
    ca.fields.add(new NumberField({ name: "dupe_score" }));
    ca.fields.add(new TextField({ name: "reviewed_by" })); // audit trail
    ca.fields.add(new DateField({ name: "reviewed_at" }));
    app.save(ca);

    // Seed feeds. PIB is the primary source per the build book, but its RSS
    // endpoint returns Hindi headlines with no body text, so a national English
    // feed rides alongside it — exactly the "admin-managed list of extra RSS"
    // the pipeline is designed around. Edit this list from /admin.
    const seeds = [
      {
        name: "PIB — All Releases",
        url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3",
        note: "Press Information Bureau, all ministries (headline-only, Hindi)",
      },
      {
        name: "The Hindu — National",
        url: "https://www.thehindu.com/news/national/feeder/default.rss",
        note: "English national news with summaries",
      },
      {
        name: "Indian Express — India",
        url: "https://indianexpress.com/section/india/feed/",
        note: "English national news",
      },
    ];
    for (const seed of seeds) {
      const s = new Record(sources);
      s.set("name", seed.name);
      s.set("url", seed.url);
      s.set("kind", "rss");
      s.set("enabled", true);
      s.set("note", seed.note);
      app.save(s);
    }
  },
  (app) => {
    for (const n of ["jobs_log", "sources"]) {
      try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) { /* absent */ }
    }
    try {
      const ca = app.findCollectionByNameOrId("ca_items");
      for (const f of ["confidence", "category", "exam_angle", "dupe_of", "dupe_score", "reviewed_by", "reviewed_at"]) {
        try { ca.fields.removeByName(f); } catch (_) { /* absent */ }
      }
      app.save(ca);
    } catch (_) { /* absent */ }
  }
);
