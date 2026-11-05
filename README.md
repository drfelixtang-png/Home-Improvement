# Stockpile Tracker

A small personal web app to track a household emergency and savings food stockpile
(5 people, 1 month): items, batches with expiry dates, a stock-take every 3 months,
and an automatic shopping list. English and Traditional Chinese (Hong Kong wording).

- Front end: React, Vite, TypeScript, plain CSS
- Database and sign-in: Supabase (email magic link, Row Level Security on every table)
- Hosting: GitHub Pages, built by GitHub Actions on every push to `main`

## Run on your computer

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```

The values come from the Supabase dashboard: Project Settings, API Keys
(Project URL and the publishable key). `.env.local` is not committed.

## Database

The schema is in `supabase/migrations/20261104000000_init.sql` (already applied to the
"Stockpile Tracker" Supabase project). Tables: `items`, `batches`, `stocktakes`,
`stocktake_lines`, `settings`. Every table has a policy that only lets the owner
(`auth.uid() = user_id`) read or write their own rows.

The 52 starter items are loaded automatically on first sign-in, and can be added again
from Settings ("Import starter list"); this only adds items that are missing.

## One-time setup for GitHub Pages

1. In GitHub: Settings, Secrets and variables, Actions, add two repository secrets:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as `.env.local`).
2. In GitHub: Settings, Pages, set "Source" to **GitHub Actions**.
3. In Supabase: Authentication, URL Configuration:
   - Site URL: `https://drfelixtang-png.github.io/Home-Improvement/`
   - Redirect URLs: add `https://drfelixtang-png.github.io/Home-Improvement/` and
     `http://localhost:5173/`
4. Merge to `main` (or run the workflow by hand from the Actions tab).

## How things work

- **Status colours:** red when nothing is on hand or a batch expires within 90 days
  (or the warning days, if smaller); yellow when below target or a batch expires within
  the warning days (default 180); green otherwise.
- **Shopping list:** every item below target, plus every item with a batch expiring
  within the warning days. Quantity to buy = target minus the stock that is not
  expiring soon, so expiring stock gets replaced. Ticking an item asks for the quantity
  and expiry and adds a batch. Ticks are kept on that device for 30 days.
- **Stock-take:** progress is saved in the database as each item is confirmed, so it can
  be paused on the phone and finished on the computer. Finishing records a snapshot of
  every active item (shown in History) and moves the due date ahead by the interval.
- **Quick +/-:** each item has a step (for example 8 kg for one rice bag). Plus adds a step to
  the newest batch (or opens a quick add form if there is none); minus takes a step from the
  batch expiring soonest and deletes batches that reach zero.
- **Prices:** entering a price when adding stock records it with the store. Each item shows its
  last, lowest and usual price per unit; a price at or below the lowest, or 15% under the usual,
  is tagged "Good price". The shopping list shows an estimated cost.
- **Where to buy:** product suggestions per item (Superstore, Walmart, T&T) with size, price,
  link and the date the price was checked. These are editable on each item page.
- **Priority:** Essential (needed to stay alive and healthy), Important (makes meals and health
  much better), Nice to have (comfort and treats).
- **Stock-up rule:** Buy extra on sale (keeps for years and used a lot), Keep at target,
  Do not overstock (loses quality or expires within about a year).
- **Group:** Food and water, or Emergency supplies. The Inventory can be filtered by all three
  and sorted by priority, stock-up rule, status or name.
- **Remove** (the x on each row, with Undo) archives an item (history is kept); restore it from "Archived items".
- **CSV export** uses UTF-8 with BOM so Excel and Numbers show Chinese correctly.

## Morning Board (`/board/`)

A personal morning dashboard that lives in the same build and shares the Stockpile
Tracker's sign-in: `https://drfelixtang-png.github.io/Home-Improvement/board/`.
Source is in `board/`; Vite builds it as a second page.

| Panel | Where the data comes from |
|---|---|
| Overnight summary, Today and tomorrow, Important inbox, SereneHost, Waiting on you, website status | A scheduled Claude task writes one row to `board_snapshots` every morning at about 7:10 am Vancouver time. The prompt is in `board/MORNING_TASK.md`. |
| Weather (Richmond, BC) | Open-Meteo, straight from the browser |
| Markets, News | The `board-feeds` Supabase Edge Function (`supabase/functions/board-feeds`), Yahoo Finance and RSS feeds |
| Stockpile | The Stockpile Tracker tables, read directly |

| WhatsApp | A Claude desktop task on the Windows computer reads the WhatsApp Desktop chat list at about 6:45 am and writes `board_extra` (kind `whatsapp`). Prompt and setup: `board/WHATSAPP_TASK.md`. |

Tables: `board_snapshots`, `board_settings` (focus note, bin day, market watchlist),
`board_item_state` (items marked done or snoozed) and `board_extra` (blocks from other
tasks), all owner only. The morning task also writes a 14-day deadlines strip, a
"This week" card on Mondays, and sends a short phone alert when something is urgent.

Optional: in Supabase, Authentication, URL Configuration, add
`https://drfelixtang-png.github.io/Home-Improvement/board/` to Redirect URLs so the
sign-in link can return straight to the board.

### Me and Review pages (`/board/#/me`, `/board/#/review`)

- **Me (我):** morning check-in (sleep, energy, mood, top 3 priorities) and evening
  check-in (priorities and habits done, hours per life area, energy, mood, one win, what
  slipped, one 0.1% improvement for tomorrow). Habit streaks with the "never miss twice"
  rule, and time per life area against weekly targets. Habits, areas and targets are
  editable on the page. The check-ins are the record of what happened; the calendar is
  only a plan.
- **Review (回顧):** this week against last week, a 30-day energy, mood and sleep chart,
  the last 14 days of wins and 0.1% notes, and Claude's weekly review.
- Tables: `checkins` (one row per day) and `board_reviews` (one per week), owner only.
- The weekly review is written on Sundays by a Claude desktop task: `board/REVIEW_TASK.md`.
