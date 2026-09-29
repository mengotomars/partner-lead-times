# Partner Lead Times dashboard

A live stacked-bar tracker of how many days each partner brief spends in every stage, from the
**Partner Brief Library** (PBL) through handoff into the **Master Creative Tracker** (MCT).

- `index.html`: the dashboard. Host it on GitHub Pages. It contains **no secrets**.
- `worker.js`: a Cloudflare Worker that reads Notion with your integration token and returns slim JSON.

```
Notion page (/embed) → index.html on GitHub Pages → Cloudflare Worker → Notion API
```

## Tabs

Every chart has a short "What it shows / How to read it / Use it to" note under its title.
Owner colours: Partnerships orange, CS blue, Leadership white, Partner yellow, Editor green, Growth cyan,
On hold grey stripes. Red is only used for the ⚑ flag icon.

The page has five tabs (the URL remembers the last one, e.g. `…/#trends`):

- **Timeline**: the stacked bar per brief, the stage breakdown, the status overview, and average and median days per phase. The average chart starts with an "Average brief" stacked bar: every stage's average added into one typical brief for the chosen start-date period (last 90 days by default). The filters here only affect this tab.
- **Trends** (window: last 3 / 6 / 12 months, by launch month): average lead time split into PBL and MCT days
  against a target line, the change over the window, stages getting slower, and a sparkline tile per stage.
  Months with fewer than 5 launches (3 for a stage tile) are faded and aren't used for comparisons.
- **Deadlines & capacity**: on-time rate by brief month (briefs with no ⚑), footage days late vs Footage Due
  Date by partner, open sprints per person against a WIP limit (CS from the `CS` people fields, editors from
  the MCT `Designer` field), assets launched per month (`Total Assets`), and lead time per asset.
- **Weekly report**: see below.
- **Spend check**: see below.

Settings at the top of the script in `index.html`: `TARGET_LEAD_DAYS` (28), `WIP_LIMIT` (5), `STALLED_DAYS`
(60: open briefs stuck this long in one stage are left out of workload and partner lateness),
`MIN_MONTH_SAMPLE`, `MIN_TILE_SAMPLE`, plus the flag limits.

The charts use Chart.js from cdnjs; everything else is plain HTML.

## How stage days are calculated

Created Date is not used. Each stage runs from its milestone date to the next milestone date that is filled in, in calendar days.
If a milestone is blank, its time is folded into the stage before it. A brief that's still in progress
counts its current stage up to today (shown with a pulsing dot).

⚑ flags: a brief is flagged only if Brief Ready Date is after its Brief Due Date, or it was sent to the
partner after the 1st of the month written in its name (only when Brief Ready Date is before that 1st;
briefs that became ready during the month, or with no month in the name, aren't checked), or the partner submitted footage more than 10 days after
the brief was sent (`FILMING_LIMIT` in `index.html`), or footage review took more than 2 days
(`FOOTAGE_REVIEW_LIMIT`). The ⚑ appears on the stage in the stack that caused it. Days to ready (Briefing Start → Brief Ready) is shown for every brief.

| Library | Stage | Owner | Runs from → to |
|---|---|---|---|
| PBL | Briefing | CS | Briefing Start Date → next date filled in |
| PBL | Brief review | VP Creative / CS lead | Brief Review Date → Brief Ready Date |
| PBL | Late send to partner | Partnerships | Only the days a brief was sent after the 1st of the month in its name, and only when Brief Ready Date was before that 1st. On-time sends count as 0; other waiting between Brief Ready and Brief Sent isn't counted. |
| PBL | Filming | Partner | Brief Sent Date → Footage Received Date |
| PBL | Footage review | CS | Footage Received Date → next step |
| PBL | Footage revisions | Partner | Revisions Start Date → Revisions Received Date (only if both are filled in and revisions started after footage came in; an open revision counts up to today) |
| PBL | Revision review | CS | Revisions Received Date → Content Approved Date |
| MCT | Edit brief | CS | Briefing Queue Date (the handoff). Days between Content Approved and this date aren't counted. |
| MCT | Waiting in queue | Editor | Design Queue Date |
| MCT | V1 production | Editor | Design Start Date |
| MCT | V1 review | CS | V1 Ready Date |
| MCT | Revisions | Editor | Revision Start Date |
| MCT | Final review | CS | Final Review Date |
| MCT | Exec review | Exec | Exec Review Date |
| MCT | Resize + upload | Editor | Finalized Creative Date |
| MCT | Growth QA to launch | Growth | Creative Ready Date, ending at Launch Date |
| MCT | On hold | Paused | On Hold Date to Off Hold Date |

A brief is linked to its MCT item through the PBL `🚀 Master Creative Tracker` relation. Archived and
test briefs are excluded, so are Commander Crew partners (outliers; `EXCLUDED_TIERS` in `index.html`), and so are template rows (names containing `XXX` or `Partner Name`).
To change any of this, edit `STAGES` / `computeStages` in `index.html` or the property lists in `worker.js`.

## Spend check tab (read-only)

Builds the Partner Spend Check message for Slack and gives you a **Copy message** button. It never posts or
edits anything.

- Reads **Active** partners from the Partners Database. A partner has $0 spend if Spend L7 is 0 or blank.
- If the newest **Last Updated** is more than 2 days old, nobody is flagged and the message is the one-line
  "⚠️ Partner spend data hasn't synced since …" note.
- For each $0 partner, the first reason that applies (a–g from the spec): ready but not launched, launched
  but not spending, spend may not be matched, stuck in review, still in production, waiting on the partner,
  nothing in the pipeline, with the owner and the sprint that's furthest along.
- **At risk**: still spending, New Ads L14 = 0, and nothing ready, in review or in production.
- Sorted by tier: Commander Crew, Flight Crew, Medical Advisor, Podcaster, Pathfinder Crew. Commander Crew
  is included here even though it's left out of the lead-time numbers.
- A partner's sprints are the MCT items linked through **Partner IG Handle**, plus MCT items linked from that
  partner's briefs (matched by the PBL **Portal Partner** link or the **Sent To** name), since most sprints
  aren't linked by IG Handle. Cut concepts (names starting "[CUT]") are ignored.
- Links point to the sprint behind the reason (the furthest along, or the most recently launched), labelled
  with the sprint name. "Launched but not spending" also says how many of those concepts have never spent at all.
- Privacy: the Worker only requests Name, Status, Tier, Designated CS, Last Updated, Last Spend Date,
  Spend L7 and New Ads L14 from the Partners Database. Spend and match confidence are turned into yes/no
  flags before they leave the Worker, so no cost, billing, dollar amounts, addresses or contact details are
  ever sent to the browser.
- The spend check is its own Worker call (`?part=spend`), which keeps each call under Cloudflare's 50-request
  limit. The Partners Database has multiple data sources, so this call uses Notion API version 2025-09-03.
  The integration must be connected to the Partners Database too.

## Status overview (top of the Timeline tab)

A written overview of everything in progress, rebuilt every Wednesday from the same snapshot as the weekly
report: where things stand (and who the work is waiting on), the slowest bottlenecks, the biggest problems
ranked against the usual weekly level, and suggestions for each. **Needs your attention now** is checked live
against today: open briefs whose current stage broke a limit, or that have been in production more than twice
the MCT limit. Click one to jump to it in the timeline. Workload suggestions also use today's numbers.
**Copy overview** copies it all as plain-text bullets. Each brief's breakdown also has a one-line plain-English
note (where it is, whose court, slowest step, what it missed).

## Weekly report (below the charts)

A new report appears every Wednesday. The report dated Wednesday D covers the 7 days before it (Wed to Tue)
and is rebuilt from the Notion dates as they stood at the end of that Tuesday, so past weeks stay put. Pick
older weeks from the dropdown. At the top is a **written summary for leadership**: short bullets (headline,
deadlines, where the time is going, focus for next week) generated from the cards. **Copy summary** puts it
on the clipboard as plain text with • bullets, ready for Slack or email. Examples in the summary skip briefs
stalled more than `STALLED_DAYS`. It always covers every
partner brief and ignores the dashboard filters.

| Card | Counts, for the week | "Right now" |
|---|---|---|
| Briefs ready past due date (CS) | Briefs whose Brief Ready Date fell in the week and was after Brief Due Date | Not ready and past due |
| Late partner footage (Partner) | Footage received in the week more than 10 days after Brief Sent Date | Sent, no footage, over 10 days |
| Footage review over 2 days (CS) | Footage reviews that finished in the week and took more than 2 days | In review over 2 days |
| Stuck in MCT over 7 days | Items launched in the week that spent more than 7 days in the MCT | In the MCT over 7 days, holds excluded |

Each card also shows the average days over the limit and the 8-week average per week, and lists the briefs.
The step table shows the average days per stage for stages finished in the last 4 weeks, compared with the 4
weeks before, plus how many briefs are sitting in each stage and for how long. The limits are `FILMING_LIMIT`,
`FOOTAGE_REVIEW_LIMIT` and `MCT_STUCK_LIMIT` in `index.html`.

## Deploy

### 1. Notion integration
The integration must be connected to **both** databases (database page → `...` → Connections).
Read-only access is enough.

### 2. Cloudflare Worker
1. dash.cloudflare.com → Workers & Pages → Create → Create Worker → name it (e.g. `partner-lead-times-api`) → Deploy.
2. Edit code → replace everything with `worker.js` → Deploy.
3. Settings → Variables and Secrets → Add → type **Secret**, name `NOTION_API_KEY`, value = your `ntn_...` token → Deploy.
4. Open the Worker URL in a browser. You should see JSON with a `briefs` array.
5. Optional, after step 3 below: add a plain variable `ALLOWED_ORIGIN` = `https://YOUR-USER.github.io`
   so only your dashboard can call it from a browser.

### 3. GitHub Pages
1. In `index.html`, set `WORKER_URL` to your Worker URL.
2. Push this folder to a GitHub repo → Settings → Pages → Deploy from branch → `main` / root.
3. The dashboard is live at `https://YOUR-USER.github.io/REPO-NAME/`.

### 4. Embed in Notion
Type `/embed` in a Notion page, paste the Pages URL, and resize. After updating `index.html`, append `?v=2`, `?v=3`… to bust Notion's cache.

## Live updates
The page reloads data from the Worker on open, every 10 minutes while visible, and on the Refresh button.
It also shows the last snapshot instantly while fresh data loads (stored in that viewer's browser).

## Notes
- **Keep the token out of git.** It only lives in the Cloudflare secret. `.gitignore` blocks `.env` / `.dev.vars`.
- The Worker URL is public: anyone who has it can read brief names, statuses and dates. Setting `ALLOWED_ORIGIN` stops other websites from reading it in a browser, but it won't stop direct requests.
- The Worker makes about 15–25 Notion requests per load (free plan limit: 50). If Cloudflare returns
  error 1102 (CPU limit exceeded) as the libraries grow, move to Workers Paid ($5/mo) or add KV caching.
- You can test a different Worker without editing the file: `index.html?api=https://other-worker.workers.dev`.
