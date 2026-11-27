# v5 direction — Budget-page redesign

The v5 redesign of the Budget-page patch. This is the design direction only
(no figures — every number in the live install comes from the user's own
budget). It supersedes the v4 compact block. The research behind it compared
the best envelope-budgeting apps (YNAB, Actual Budget's own Reports page,
EveryDollar, Goodbudget, Monarch, PocketSmith, and others) and the
visualizations they use.

## What changes from v4

| v4 (current) | v5 (direction) |
| --- | --- |
| The Budget table scrolls inside its own container. | **The whole page scrolls as one.** The table's own scroll container goes away (the sticky table header is kept). |
| The month selector is a small control. | **The calendar/header spans the full width of the page** and becomes one band holding the month navigation, the numbers, and the charts. |
| Numbers and charts are separate. | **Numbers and charts are integrated into that header**, and made pretty. |
| Long explanatory text. | **`(i)` info icons and hover tooltips** carry the explanations, so less text is needed. |
| Bar charts below the numbers. | **Bar charts at the top**, in the header, with hover tooltips and a toggle (income-vs-spending / saved). |
| Net worth is a strip. | **Total net worth at the top, with a +/- vs last month** chip. |
| Money that looks "unbudgeted" sits in a pile. | **An "every dollar has a job" allocation strip**: net worth by bucket, plus a progress bar for the future down-payment goal. Invested money is shown as *for investing*; the down-payment savings is shown as *earmarked for the future down payment*, not as unexplained unbudgeted money. |

## Layout (v5)

A full-width header band, top to bottom:

1. **Month navigation** (the calendar, full width).
2. **Net-worth hero** — Total net worth with a delta chip — then four stat
   chips (Spent of budget with the amount left · Income · Saved ·
   allocation).
3. **Full-width bar chart** — monthly income vs spending, with per-month
   hover (income / spending / saved / change from last month) and the
   Income-vs-Spending | Saved toggle.
4. **Allocation strip + compact goal tracker** — the buckets as a stacked
   bar, the future-down-payment progress bar, and the savings-goal tracker.

Below the header, the Budget page flows with whole-page scroll.

## Rules the build must follow

- **One `DATA` object feeds both the numbers and the charts**, with a
  reconciliation self-check (income − spending = saved; the quarterly saved
  amounts sum to the year-to-date; the buckets sum to the net worth). The
  numbers and the charts can never disagree again.
- **Extended live-read validation.** The Spent reader validates the month,
  the budget, and the spent amount before trusting anything live, and falls
  back to the baked-in figures otherwise. A repeat of the old "wrong month /
  wrong budget" bug and of polluted table totals (transfers counted as
  spending) must be impossible.
- **Honest net-worth delta.** A true month-by-month net-worth series cannot
  be built from the data (the opening balances are all dated the same day, so
  earlier months' transaction sums would be wrong — Actual's own Reports
  graph has the same gap). So the delta shows against a stated baseline now,
  plus the real month-over-month movement that *is* computable (the saved
  amount vs last month) and a saved-amount sparkline — and a snapshot
  mechanism so a true "vs last month" net-worth delta appears once a later
  month's data exists. Never invent a monthly net-worth series.
- **The down-payment savings is earmarked, not extra.** It sits inside
  liquid cash (leaving a small operating remainder); it must not be
  double-counted on top of liquid cash.
- **No Available funds, no standalone "saved in the year", no placeholder
  amount, no polluted totals.** Keep working: Income group on top, income
  green, "Overspent in \<month\>" red, Uncategorized transfer-row hiding
  (display-only).
- **Hand-rolled SVG/CSS only** for the v5 core. No new backend, no new data
  source, no library.

## Build order

**First:** whole-page scroll + full-width header + net-worth hero/delta +
bar chart on top + allocation strip + tooltips + reconciliation self-check.

**Later:** a waterfall chart (starting value changed by a sequence of
positives/negatives — the "where did the money go" story), per-category
budget-vs-actual mini bars, a Sankey money-flow diagram (the only item that
needs a library — vendor it as a separate file), click-a-bar-to-change-month,
and a projected hit date for the down-payment goal once a monthly savings
rate is confirmed.

## Patterns borrowed (from the research)

- **YNAB:** hover-to-inspect on every chart element, a Totals/Trends toggle,
  budget-vs-actual green/red bars, and a single-number buffer metric.
- **Actual's own Reports page:** hover for Assets/Debt/Net worth/Change and
  a Trend/Stacked mode on the Net Worth graph; a balance line overlaid on
  Cash Flow; Summary cards and a Calendar card. v5 complements this page, it
  does not rebuild it.
- **Monarch:** the Sankey money-flow diagram (income → categories →
  savings), drill-down (click an account to see its history), and goals with
  projected hit dates.
- **EveryDollar / Goodbudget:** Sinking Funds and Goal envelopes with due
  dates — the pattern for the "unbudgeted is budgeted" money.
- **PocketSmith / Copilot / Wallet:** widget dashboards, actual-vs-budgeted
  trends, and month-over-month % change highlights.
- **ClearWorthPlanner / CalmDollar:** a waterfall chart, and a
  Planned/Actual/Compare toggle that doubles a chart's value.
