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
| ca-pipeline | 05:30 + 17:30 daily | 13 |
| monthly-ca-compilation | manual / monthly | Appendix B |

## Cron entries
Managed in `/etc/cron.d/upscvidya-jobs` (create when the first job lands).
Server timezone is Asia/Kolkata, so cron expressions are IST.
