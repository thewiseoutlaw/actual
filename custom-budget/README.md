# custom-budget — Budget-page customizations for a self-hosted Actual Budget

A small, defensive front-end customization for [Actual Budget](https://github.com/actualbudget/actual)
(the open-source envelope budgeting app), plus the scripts and guides that go
with running it. **Everything in this directory is a demo/template: every
figure is a placeholder, every account name is generic (Account A/B/C, Card
A–H), and there are no real balances, names, or hostnames anywhere.** Set it
up by editing **one YAML file** (see [Setup](#setup)) — never by editing the
JavaScript.

> **v5 is coming.** The patch here is v4 (the compact Budget-page block).
> A v5 redesign (whole-page scroll, full-width header band, net worth at the
> top with a month-over-month delta, bar charts at the top, an
> "every dollar has a job" allocation strip, and `(i)` hover tooltips) is in
> progress and will replace `actual-budget-tweaks.js.template` when it lands. See
> [`docs/v5-direction.md`](docs/v5-direction.md).

## What the patch does

`actual-budget-tweaks.js` is a single script loaded by Actual's `index.html`.
It only touches the Budget page and the Uncategorized transactions view. It
never touches budget data, the server, or the API.

**Budget page:**
- Moves the **Income** group to the top of the budget table (Actual renders
  it at the bottom).
- Colours income amounts **green** when they increase the balance.
- Colours the **"Overspent in \<month\>"** summary line **red** (only when it
  is genuinely negative).
- Adds one **compact block** above the budget table:
  - a savings-goal tracker (quarterly + annual, one slim progress bar per
    quarter),
  - a **Total net worth** strip (including the home value) with a
    "back to the May amount?" comparison and a one-line bucket breakdown
    (Brokerage · Liquid · Retirement · Home equity · Other),
  - a **"Spent in \<month\>"** line (read live from the Budget page header
    when it validates, otherwise the config fallback figures),
  - a compact monthly **income-vs-spending bar strip** with the saved
    amount under each month.
- The down-payment placeholder is **not** counted alongside the home value
  (the home replaces it). **Available funds is not shown anywhere.**

**Uncategorized transactions view:**
- Hides rows that are **transfers** (display only — no data is changed), so
  the list only shows transactions that genuinely need a category. A small
  note with a Show/Hide toggle is added, and the view total is recomputed
  from the visible rows.

**How it works:** Actual is React, so a one-time DOM move would be undone on
the next render. The script re-applies the tweaks with a debounced
`MutationObserver`. Every tweak is idempotent and defensive: if Actual's DOM
changes, each tweak no-ops instead of throwing.

## Setup

The customization is driven by **one config file**. The patch itself is
generated from a template, so you never edit JavaScript:

```sh
# 1. Copy the example config and fill in your own figures.
cp config.example.yml config.yml
#    Edit config.yml: total net worth, the bucket amounts (Brokerage,
#    Liquid, Retirement, Home equity, Other), home value, the monthly
#    income/spending/saved series, the savings-goal targets (quarterly
#    and annual), the down-payment goal and current amount, the
#    account-name matchers (rename them to your own account names),
#    and the install settings (build dir, server URL).
#    Every section is commented in the file. All figures must reconcile
#    (income − spending = saved; buckets sum to net worth) — the build
#    step checks this and refuses a config that does not.

# 2. Install. This builds the patch from config.yml, backs up the web
#    build directory (dated backup — never delete it), copies the patch
#    in, adds one <script> line to build/index.html, and verifies.
./install-tweaks.sh
```

No server restart is needed (the bundle is static). Then hard-refresh the
browser (Cmd/Ctrl+Shift+R).

`config.yml` is **your real config and is gitignored — never commit it.**
`config.example.yml` is the committed template with demo figures.

`BUILD_DIR` and `SERVER_URL` can also be given as environment variables;
they override the config's `install` settings:

```sh
BUILD_DIR=/path/to/actual-app/web/build \
SERVER_URL=https://example.com:5006 \
./install-tweaks.sh
```

**Never run `npm install` or the community-scripts updater on the live
server** — it reinstalls Actual and wipes this patch (and the API keys).

### What is committed, what is generated

- **Committed (source of truth):** `config.example.yml` (the config
  template with demo figures), `actual-budget-tweaks.js.template` (the
  patch with `{{PLACEHOLDER}}` tokens where the figures go), and
  `build-patch.js` (plain Node, no dependencies — the tiny YAML parser,
  the reconciliation validation, and the token substitution).
- **Generated, not committed:** `actual-budget-tweaks.js` (built by
  `build-patch.js` from the template + `config.yml`, or from
  `config.example.yml` when there is no `config.yml`). CI and
  `install-tweaks.sh` build it on the fly, so it is gitignored along with
  `config.yml`. **Never edit the generated file directly** — change the
  template or the config and rebuild.

To build the patch by hand (without installing):

```sh
node build-patch.js            # config.yml if present, else config.example.yml
node build-patch.js --check    # validate the config only, no output
node build-patch.js --print config.example.yml install.build_dir
```

## Roll back

Copy the pristine backup back over the build directory (or restore its
`index.html` and delete `actual-budget-tweaks.js`), then hard-refresh.
The backup is `<build-dir>.bak-<date>-actual-ui-patch`.

## Verify

```sh
./tests/run-tests.sh
```

That builds the patch from `config.example.yml`, syntax-checks it, and runs
both test suites (plain Node, no extra dependencies):
`tests/test-tweaks.js` (the fake-DOM harness: Budget page scenarios,
Uncategorized transfer-row hiding, and the demo-figure reconciliation) and
`tests/test-build.js` (the build step: a valid config builds; a config whose
figures do not reconcile — a month's saved, a quarter's saved, the
year-to-date figure, the net worth, or the current month's spent — is
rejected, as is a missing required value). See
[`tests/README.md`](tests/README.md).

## Contents

| Path | What it is |
| --- | --- |
| `config.example.yml` | The config template (demo figures). Copy to `config.yml` and fill in yours. |
| `config.yml` | **Your real config — gitignored, never commit it.** |
| `actual-budget-tweaks.js.template` | The patch as a template (`{{PLACEHOLDER}}` tokens for the figures/names). |
| `actual-budget-tweaks.js` | The generated patch — built on the fly, **not committed**. |
| `build-patch.js` | The build step: tiny YAML parser + reconciliation validation + token substitution (plain Node, no dependencies). |
| `.gitignore` | Ignores `config.yml` and the generated `actual-budget-tweaks.js`. |
| `install-tweaks.sh` | Build + install + verify script (reads the install settings from the config; env vars override). |
| `tests/` | Fake-DOM test suite, build-step tests, runner, README. |
| `docs/` | READMEs, the agentic operating guide, the v5 direction, screenshots. |
| `scripts/` | Template versions of the companion scripts (account groups, mortgage upkeep, rules, revert). |

## Screenshots

Mock renders (clearly labelled, demo figures only) are in
[`docs/screenshots/`](docs/screenshots/). See the caption list in
[`docs/README.md`](docs/README.md).

## For AI agents

Read [`docs/AGENTIC-OPERATING-GUIDE.md`](docs/AGENTIC-OPERATING-GUIDE.md)
before changing anything in this directory. It lists the hard constraints
(never `npm install` on the live server, never delete the backup, never trust
`api.addTransactions()`' return value, the API key is transient per task,
transfers stay uncategorized, sanitize everything) and the workflows for
installing, verifying, rolling back, and updating rules. **Edit the config
or the template — never the generated patch, and never commit `config.yml`
or the generated patch.**
