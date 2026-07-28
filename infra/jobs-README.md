# /opt/jobs — scheduled scripts

Node.js scripts run by cron under the `appadmin` user. Each job gets its own
folder with a `package.json`; shared deps installed per-job (pnpm).

## Conventions
- One folder per job: `/opt/jobs/<job-name>/index.js`
- Secrets via `/opt/jobs/<job-name>/.env` (chmod 600), never committed
- Every run logs to stdout; cron redirects to `/var/log/jobs/<job-name>.log`
- Failures should exit non-zero — add alerting hook when available

## Planned jobs (from the build book)
| Job | Schedule (IST) | Prompt |
|---|---|---|
| ca-pipeline | 05:30 + 17:30 daily | 13 — LANDED: [jobs/ca-pipeline](jobs/ca-pipeline) |
| monthly-ca-compilation | manual / monthly | Appendix B |

## Cron entries
Managed in `/etc/cron.d/upscvidya-jobs` (create when the first job lands).
Server timezone is Asia/Kolkata, so cron expressions are IST.

## ca-pipeline deploy notes
- Copy `infra/jobs/ca-pipeline/` to `/opt/jobs/ca-pipeline/`
- `.env`: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, OPENROUTER_API_KEY / GEMINI_API_KEY / MISTRAL_API_KEY / OPENCODE_API_KEY / GROQ_API_KEY (any one; optional — heuristic mode without any)
- Cron: `30 5,17 * * * appadmin cd /opt/jobs/ca-pipeline && node index.js >> /var/log/jobs/ca-pipeline.log 2>&1`
- Dry run anywhere: `node index.js --dry-run --print --limit 5`
