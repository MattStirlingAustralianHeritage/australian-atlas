# Outreach reliability — automated protections

The three outreach engines (operator `/admin/outreach`, press `/admin/press-outreach`,
trade `/admin/trade-outreach`) are designed to run indefinitely with no manual
supervision. This is the map of what keeps them honest. If you change outreach
code, keep every layer below intact.

## Send-time rules (enforced in code, not by the schedule)

- **9am–5pm Melbourne only** — `lib/outreach/sendWindow.js`. Autopilot crons zero
  their quotas outside the window; `sendCampaign` / `sendPressCampaign` /
  `sendTradeCampaign` hard-throw as a backstop; admin manual-send routes return a
  clean 400. DST-aware (`Australia/Melbourne`), never a fixed UTC offset.
- **Weekdays only** — `isWeekendAEST()` in each autopilot cron.
- **Daily caps anchor to the Melbourne calendar day** — `melbourneDayStart()`
  (fix for the 2026-07-21 rolling-24h starvation incident: a lookback window
  that could see yesterday's batch halves throughput forever).

## Schedules (vercel.json, UTC)

| cron | schedule | Melbourne |
|------|----------|-----------|
| outreach-autopilot | `30 3,23 * * *` | 9:30am + 1:30pm catch-up |
| press-outreach-autopilot | `45 3,23 * * *` | 9:45am + 1:45pm catch-up |
| trade-outreach-autopilot | `0 4,23 * * *` | 9:00am + 2:00pm catch-up |
| outreach-watchdog | `30 0 * * *` | 10:30am |

The afternoon runs exist for self-healing: if a morning run dies (deploy race,
timeout, platform kill), the afternoon run sends whatever the Melbourne-day cap
still allows. On a healthy day it's a no-op for sending and just advances
discovery/personalisation. Quota accounting makes double-runs safe by design —
never remove the catch-up slot "because it usually sends nothing".

## Monitoring (two layers, both email matt@)

1. **fleet-health** (`/api/cron/fleet-health`, 20:30 Melbourne) — liveness:
   overdue / failing / stranded runs, all agents including the three autopilots
   and the watchdog itself.
2. **outreach-watchdog** (`/api/cron/outreach-watchdog`, 10:30am Melbourne) —
   outcomes, per engine, from the delivery data (not the code paths):
   - `UNDER_CAP` — ≥2 of last 3 Melbourne weekdays sent <50% of cap with pool waiting
   - `ZERO_TODAY` — weekday, past 10am, pool waiting, zero sends since Melbourne midnight
   - `BOUNCE_RATE` / `BOUNCE_CRITICAL` — 7d bounce >20% warns; >35% (n≥20)
     **auto-pauses that engine's `send_enabled`** to protect the sender domain
   - `OFF_WINDOW` — any send stamped outside 9am–5pm Melbourne or on a weekend
     in the trailing 24h (end-to-end audit of the send-window rules)
   - `FU_BACKLOG` — follow-up backlog >7× the daily follow-up cap
   - `RUN_STUCK` / `RUN_ERROR` — stuck (2h+) or errored runs
   It emails only on issues; every sweep logs metrics to `agent_runs`
   (`agent = 'outreach-watchdog'`) so trends stay queryable.

## Debug endpoints

Every outreach cron accepts `?dryRun=1` (Bearer `CRON_SECRET`): full plan /
findings, zero writes, zero emails. Check the watchdog's view first when
something looks off:

```
GET /api/cron/outreach-watchdog?dryRun=1
```

## Known failure modes this design answers

| Failure | Caught by |
|---------|-----------|
| Cron vanishes from vercel.json / platform stops firing | fleet-health OVERDUE |
| Run crashes or hangs | fleet-health FAILING/STRANDED, watchdog RUN_* + afternoon catch-up self-heals the day |
| Runs green but sends starved (quota logic bug) | watchdog UNDER_CAP / ZERO_TODAY |
| Resend outage or filter regression drops sends to zero | watchdog ZERO_TODAY (same day) |
| Bad email batch torches domain reputation | watchdog BOUNCE_* + auto-pause |
| A new send path ignores the business-hours rule | watchdog OFF_WINDOW (audits data, not code) |
| Follow-ups silently stop | watchdog FU_BACKLOG |

Residual gap (accepted): if *Vercel cron as a whole* stops, both monitors stop
with it — a truly external dead-man's switch would need a third-party pinger.
