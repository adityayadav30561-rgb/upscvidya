# Screen → Build-Prompt Map

**Rule: the design (docs/design) is the source of truth.** The build book's
prompts are one revision behind the design — where they conflict, the design
wins (e.g. 14 rank grades, not 10). Screens 17-22 are newer than the build
book; this file pins where each screen lands so nothing is dropped.

| # | Screen | Built in | Notes |
|---|---|---|---|
| 01 | Onboarding | Prompt 04 | 3-step; flows out of Screen 17 signup |
| 02 | Home Dashboard | Prompt 09 | shell live since Prompt 03 |
| 03 | Territory Map | Prompt 05 | |
| 04 | Topic Reader | Prompt 06 | |
| 05 | Quiz Player | Prompt 07 | |
| 06 | Quiz Results | Prompt 07 | |
| 07 | Revision Stack | Prompt 08 | |
| 08 | Test Centre | Prompt 11 | |
| 09 | Mock Test Player | Prompt 11 | |
| 10 | PYQ Vault | Prompt 12 | |
| 11 | Daily Briefing | Prompt 13 | |
| 12 | PET Tracker | Prompt 16 | |
| 13 | Leaderboard | Prompt 10 | |
| 14 | Profile Ranks | Prompt 09 (rank system) + profile route | 14-grade ladder |
| 15 | Paywall | Prompt 14 | |
| 16 | Admin Queue | Prompt 13 | |
| **17** | **Login / Sign up** | **Prompt 04** | Design is phone-number-first (OTP) with Google + email fallback. PocketBase has email-OTP built in; phone OTP needs an SMS provider — decide at Prompt 04 (start with Google + email per build book, layout per Screen 17; phone OTP when SMS provider chosen). |
| **18** | **Path Generated** | **Prompt 04** (end of onboarding) | One-time takeover after onboarding: campaign route draws itself, milestone timeline, then → dashboard. Timeline rows re-used by Screen 19's pace-change confirm. |
| **19** | **Settings & Account** | **Prompt 09** (profile phase) + toggles wired as features land (push opt-outs P15, plan mgmt P14, anonymous toggle P10) | Groups: notifications, appearance (Night theme), study prefs, account/privacy. |
| **20** | **Checkout & Success** | **Prompt 14** | Order review before Razorpay (UPI first) + receipt view. RECEIPT chip in Screen 19 opens past payment here. |
| **21** | **Community — Mess Hall** | **After Prompt 10** (needs battalions) — insert as its own step | Weekly challenges tied to study output + battalion-scoped doubts feed. Needs new pb collections (posts/challenges) — schema addition when built. |
| **22** | **Progress & Study Stats** | **Prompt 09** (dashboard phase) | Study calendar month view, weekly minutes, accuracy vs 70% conquest line, session timeline. Lives inside the Profile area. |

Also: rank ladder + XP thresholds per design (pb/SCHEMA.md table); Screen 02
mockup numbers (5,940/7,500 XP → Sub Inspector) confirm the design thresholds.
