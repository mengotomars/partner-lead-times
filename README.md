# Partner Lead Times dashboard

A live stacked-bar tracker of how many days each partner brief spends in every stage, from the
**Partner Brief Library** (PBL) through handoff into the **Master Creative Tracker** (MCT).

- `index.html`: the dashboard. Host it on GitHub Pages. It contains **no secrets**.
- `worker.js`: a Cloudflare Worker that reads Notion with your integration token and returns slim JSON.

```
Notion page (/embed) → index.html on GitHub Pages → Cloudflare Worker → Notion API
```

## Tabs

Five tabs, each linkable: `#today` (default), `#briefs`, `#trends`, `#partners`, `#report`. Every section has
a title, a one-line subtitle and an ⓘ with the full "what it shows / how to read it" note. A red outline on a
segment or card means it broke a deadline.

- **Today**: lead time for the last 30 days against the 28-day target, briefs past a deadline right now, and
  partners at $0 spend. **Who to chase** groups every overdue brief into Creative strategists, Editors,
  Growth and Partners (longest overdue first, each linking to Notion). **$0 spend this week** is the spend
  check as a table, with **Copy for #partnerships** (the Slack message format).
- **Briefs**: filters (search, start date, month, product, Late only). **The typical brief** shows the average
  days per phase (queue time striped inside Editing) with the median per phase and the four longest steps.
  **Every brief** lists each brief with its phase bar (or all 17 steps), where it is now, its longest step and
  its total. Click a row for a plain-English breakdown with one card per phase.
- **Trends** (3 / 6 / 12 months): lead time by launch month split into Brief Library vs production, a tile
  with a sparkline for every one of the 17 steps grouped by phase, open sprints per person against
  `WIP_LIMIT`, and assets launched per month.
- **Partners**: footage on time vs late by brief month, a heatmap of every active partner (except
  Commander Crew and `EXCLUDED_PARTNERS`) by month, and **Data to fix** for briefs that can't be checked.
  Late = footage received more than `FILMING_LIMIT` days after Brief Sent, or still Sent To Partner / Edits
  Requested after that. Footage Due Date is not used.
- **Weekly report**: pick a week. Leadership summary (Headline, Where the time went, Missed deadlines, Focus
  for next week) with **Copy summary**, the four deadline cards with their brief lists, phase pacing (last 4
  weeks vs the 4 before), and the weekly status overview with **Copy overview**.

## Phases

The 17 stages are grouped into five phases (the `PHASES` config in `index.html`):

| Phase | Owner | Stages | Colour |
|---|---|---|---|
| Brief | CS | Briefing, Brief review, Late send to partner | blue |
| Filming | Partner | Filming, Footage revisions | yellow |
| CS review | CS | Footage review, Revision review, Edit brief | pink |
| Editing | Editor | Waiting in queue (striped), V1 production, V1 review, Revisions, Final review, Exec review, Resize + upload | green |
| Launch | Growth | Growth QA to launch | purple |
| On hold | | not counted as production time | grey |

## Lead time (one definition everywhere)

**Lead time** = counted stage days from Briefing Start to Launch, with time on hold excluded, for briefs that
have launched. It's exactly what a brief's bar adds up to. Waits that are deliberately not counted (a ready
brief waiting for the 1st, Content Approved → MCT handoff) aren't included. Every tab shows the same number,
labelled "Lead time (median, briefing → launch)". Set `LEAD_TIME_METRIC` to `'average'` to switch.

- Timeline/Briefs: briefs launched in the chosen start-date period (last 90 days by default).
- Today: briefs launched in the last `LEAD_TIME_TODAY_DAYS` (30).
- Trends: per launch month. Weekly report: launches in the report week.

## Who is included

- **Current roster only** (header toggle, on by default, remembered per browser): only briefs whose partner
  is Active in the Partners Database. A line under the header says how many briefs are hidden. With it off,
  those briefs show a "Not on roster" tag. If the Partners Database can't be read, everyone is shown.
- Partners are matched by the brief's Portal Partner link, then Sent To, then the name in the brief title.
  Dots, commas and case are ignored, and `PARTNER_ALIASES` maps other spellings to one name.
- Left out everywhere: `EXCLUDED_TIERS` (Commander Crew), `EXCLUDED_PARTNERS`, statuses Archive and Test
  Status, template or test names (`XXX`, `Partner Name`, `Week#`, `Week1`, `TEST`), and briefs with no
  milestone dates at all.

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

## Spend check (Today tab, read-only)

The "$0 spend this week" table on Today builds the Partner Spend Check message for Slack and gives you a
**Copy for #partnerships** button. It never posts or edits anything.

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

## Status overview (Weekly report tab)

A written overview of everything in progress, rebuilt every Wednesday from the same snapshot as the weekly
report: where things stand (and who the work is waiting on), the slowest bottlenecks, the biggest problems
ranked against the usual weekly level, and suggestions for each. Workload suggestions use today's numbers.
**Copy overview** copies it as plain-text bullets. The live list of overdue briefs is **Who to chase** on the
Today tab: open briefs whose current step broke a limit, or that have been in production more than twice the
MCT limit, grouped by who to chase. Each brief's breakdown on the Briefs tab has a one-line plain-English note
(where it is, whose court, slowest step, what it missed).

## Weekly report (Weekly report tab)

A new report appears every Wednesday. The report dated Wednesday D covers the 7 days before it (Wed to Tue)
and is rebuilt from the Notion dates as they stood at the end of that Tuesday, so past weeks stay put. Pick
older weeks from the week picker. At the top is the **leadership summary**: four blocks (Headline, Where the
time went, Missed deadlines, Focus for next week), two short sentences each in phase language, generated from
the cards. **Copy summary** puts it on the clipboard as plain text with • bullets, ready for Slack or email. Examples in the summary skip briefs
stalled more than `STALLED_DAYS`. It always covers every
partner brief and ignores the dashboard filters.

| Card | Counts, for the week | "Right now" |
|---|---|---|
| Briefs ready past due date (CS) | Briefs whose Brief Ready Date fell in the week and was after Brief Due Date | Not ready and past due |
| Late partner footage (Partner) | Footage received in the week more than 10 days after Brief Sent Date | Sent, no footage, over 10 days |
| Footage review over 2 days (CS) | Footage reviews that finished in the week and took more than 2 business days | In review over 2 business days |
| Stuck in MCT over 7 days | Items launched in the week that spent more than 7 days in the MCT | In the MCT over 7 days, holds excluded |

Each card shows "X of Y missed", the 8-week average ("usually"), how many are still open, and a "Show the Y
briefs" list. **How each phase is pacing** compares the last 4 weeks with the 4 before per phase, only using
steps that have values in both periods, plus how many briefs are in each phase now. The limits are `FILMING_LIMIT`,
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
