# Tests — custom-budget

Plain-Node tests for the custom-budget patch. No extra dependencies, no
network, no live server. All fixtures use placeholder/demo figures and
generic account names.

The patch is generated, not committed: the test runner builds it first from
`actual-budget-tweaks.js.template` + `config.example.yml` (via
`build-patch.js`, which also validates that the demo figures reconcile),
then tests the generated `actual-budget-tweaks.js`.

## Run

```sh
# from custom-budget/
./tests/run-tests.sh
# or directly:
node build-patch.js config.example.yml
node --check actual-budget-tweaks.js
node tests/test-tweaks.js
node tests/test-build.js
```

CI runs the same steps on every push / pull request that touches
`custom-budget/` (see `.github/workflows/ci.yml` at the repo root).

## What `test-tweaks.js` covers

A fake DOM (textContent concatenates descendants, like the real DOM) plus an
export hook injected into the patch source, so the tests can call the patch's
internals directly.

| Scenario | What it asserts |
| --- | --- |
| 1. Budget, live sidebar + correct November header | Bucket totals reconcile (retirement, brokerage, net spendable, home equity, other, net worth); the down-payment placeholder is NOT counted; `allLive` is true; the Spent reader returns the live November values; the compact block has the goal tracker first, the net-worth strip, the May comparison line, the bucket detail, the Spent line (under budget, never "over budget"), no Available funds, no standalone saved-year number, no placeholder amount, no wrong-budget value, no "Spent in October"; the goal bars, the model note, the monthly bar strip, and compactness (short block, no border/background/position/overflow/fixed height); Income moved to the top; the original summary card is still present. |
| 2. Wrong month (October title) | Falls back to the baked-in November figures; never renders "Spent in October". |
| 3. Wrong budget | A budget that does not validate falls back to the baked-in figures; renders "$2,500.00 left", never "over budget". |
| 4. Unreadable header | Falls back to the baked-in figures. |
| 5. Genuinely over budget | Reads live and renders "$500.00 over budget". |
| 6. Uncategorized — transfer rows hidden | Detects the view, finds all 7 rows, flags transfer rows (icon and arrow payee), leaves genuine rows visible, hides the 5 transfer rows, inserts the note ("5 transfers hidden", "Show transfers" button), recomputes the total from visible rows, and the toggle shows/hides them again and restores the total. |
| 7. Unrecognisable structure | No-ops safely (does not throw, does not hide the row). |
| Reconciliation | Every month: income − spending = saved. Quarterly saved sums to the year-to-date figure. The buckets sum to the net worth. The net worth matches the rendered strip. The November saved amount matches the bar strip. |

## What `test-build.js` covers

The build step (`build-patch.js`), by running it as a subprocess against
`config.example.yml` and small mutations of it (written to temp files, then
deleted):

- A valid config builds (exit 0), the generated patch has no unresolved
  `{{TOKEN}}`s and passes `node --check`, and `--check` / `--print` work.
- A config that does **not** reconcile is rejected (non-zero exit): a
  month's saved ≠ income − spending; a quarter's saved ≠ the sum of its
  months; the year-to-date figure ≠ the sum of the months; the net worth ≠
  the sum of the buckets; the current month's spent ≠ that month's
  spending. A missing required value (e.g. no `home.value`) and an unknown
  `account_names` key are also rejected.
- A rejected build never overwrites the previously built patch (validation
  runs before the write).

## Fixtures

The demo figures live in `config.example.yml` (the committed config
template). The demo sidebar has 25 generic accounts (Retirement A/B,
Brokerage A–C, Cash A–D, Cash on hand, Card A–H, Mortgage, House down
payment, Other A–E) with placeholder balances. Card E carries a small
positive credit, which the card sum handles. The demo monthly series is
May–November with income $12,000/month; the demo savings goal is
$10,000/quarter and $40,000/year.

## Adding a test

Add a scenario to `test-tweaks.js` using the same `check(name, cond, extra)`
helper, and keep every fixture value a placeholder. Never put a real balance,
account name, or hostname in a fixture. If a new check needs a value from the
patch, read it from the exported `FALLBACK` / `YEAR` / `GOALS` objects rather
than hard-coding it. For a build-step check, add a case to `test-build.js`
by mutating the example config text and asserting the build's exit code
(and that the error names the offending value). If you change a demo figure,
change it in `config.example.yml` — the build validates the reconciliation,
and both suites assert the figures agree.
