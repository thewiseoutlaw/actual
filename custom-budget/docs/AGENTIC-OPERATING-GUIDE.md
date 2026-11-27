# Agentic Operating Guide — custom-budget

A guide for an AI agent working on this repo (and on the live self-hosted
Actual Budget install it customizes). Read this before changing anything.
The short version: **the patch is a thin, defensive layer on top of Actual;
never break the live server, never leak real data, and prove every change
with the test suite.**

## What lives here

- `custom-budget/config.example.yml` — the config template (demo figures).
  Copy it to `config.yml` and fill in your own figures.
- `custom-budget/actual-budget-tweaks.js.template` — the Budget-page patch
  (v4) as a template, with `{{PLACEHOLDER}}` tokens for the figures/names.
- `custom-budget/build-patch.js` — the build step: a tiny YAML parser, the
  reconciliation validation, and the token substitution (plain Node).
- `custom-budget/actual-budget-tweaks.js` — the **generated** patch, built
  on the fly by `build-patch.js` (or `install-tweaks.sh`). **Never edit it
  directly, and never commit it** — it is gitignored.
- `custom-budget/tests/` — the fake-DOM test suite + the build-step tests
  (plain Node).
- `custom-budget/scripts/` — template scripts for the companion jobs
  (account groups, mortgage upkeep, rules, revert). Templates only: fill in
  the placeholders for a real budget.
- `custom-budget/docs/` — READMEs, the v5 direction, and mock screenshots.
- `.github/workflows/ci.yml` — CI (build from the demo config, Node syntax
  check + test suites, secrets check).

Everything in `custom-budget/` is a **demo/template**. Every figure is a
placeholder, every account name is generic. Never commit a real balance,
account name, hostname, ID, or key here.

## Hard constraints (do not violate these)

### 1. Never reinstall or update Actual on the live server
Do **not** run `npm install`, the community-scripts updater, or anything that
reinstalls/updates Actual on the live server. It reinstalls the app, wipes
this patch, and removes the API keys. The patch is installed by copying one
file into the web build directory and adding one `<script>` line to
`index.html` (see `install-tweaks.sh`). No server restart is needed.

### 2. Never delete or overwrite the pristine backup
Before the patch was first installed, a pristine copy of the web build
directory was saved (a dated `*.bak-*-actual-ui-patch` directory). **Never
delete it and never overwrite it.** It is the rollback. If you must back up
again, make a *new* dated backup; never reuse the pristine one's name.

### 3. Never trust `api.addTransactions()`' return value for an id
`@actual-app/api`'s `addTransactions()` does **not** reliably return the new
transactions (its `[0]` can be a string, not a transaction). Never use the
return value as an id. Always **re-read the account and match by (date,
amount, notes)** to find a row you just added. This has bitten twice: once
it tombstoned the original transactions and orphaned the new ones, and once
it left probe rows and a test account behind. If a script fails mid-probe,
clean up the test account and its rows before reporting done.

### 4. The Actual API key is transient per task
The user pastes a fresh API key per task. Use it **once, via stdin/env**
(e.g. a wrapper that reads the key from stdin and exports it as an env var),
**never write it to a file, never store it, never commit it, and never paste
it into chat or a log.** A scheduled job has no key and must not extract one
from the server database. If a job needs a write, it computes the change and
tells the user; the write happens only when the user is in chat with a fresh
key.

### 5. One single command per remote-shell call
The SSH helper used to reach the server only reliably forwards the **first**
command. Do **not** chain commands with `;` or `|` in one call (later parts
silently run on the wrong host, where the paths do not exist). Use one single
command per call, or push a script file and run it.

### 6. Transfers must stay uncategorized
**Never give a transfer transaction a category.** Assigning a category to
transfers makes Actual's Budget table count them as spending, which inflates
the table's Spent/Balance totals (the API's `totalSpent` does not change, so
a one-row test will misleadingly pass — the pollution shows in the UI table,
not in the API). Transfers are correctly recorded as transfers and do not
need a spending category. The Uncategorized view hides transfer rows
display-only (the patch does this); the data stays uncategorized. If a
categorization ever pollutes the table, revert it by setting the category
back to `null` on the affected rows (see `scripts/revert-transfers-category.template.js`).

### 7. Sanitize everything before it leaves the machine
Never commit or upload real numbers, names, IDs, keys, or personal URLs.
That means: no dollar amounts, balances, or transaction amounts; no account
numbers (not even last-4s); no loan numbers; no real dates tied to real
events; no real payee/merchant names; no real account names; no real emails;
no personal URLs; no LAN IPs; no sync IDs, category IDs, account IDs, or
rule IDs; no API keys. Use clearly fake placeholders (`User`, `Partner`,
`Account A/B/C`, `Merchant X`, `$1,234.56`, `example.com`, documentation IP
`192.0.2.1`, placeholder UUIDs like
`00000000-0000-0000-0000-000000000000`). Before pushing, grep every file for
the real values and confirm zero matches. If a file cannot be sanitized
cleanly, **do not push it** — leave it out and list it as excluded.

### 8. Do not modify the upstream source
All of our work goes under `custom-budget/` (plus the CI workflow at
`.github/workflows/ci.yml` and a short pointer in the top-level README).
Never edit the upstream app's code. Keep the fork's upstream history intact.

### 9. The patch is config-driven — never edit the generated file
The patch is built from `actual-budget-tweaks.js.template` +
`config.yml` by `build-patch.js`. **Edit the template or the config — never
`actual-budget-tweaks.js` directly** (your edit would be overwritten by the
next build). **Never commit `config.yml` or the generated patch** — both are
gitignored; the template + `config.example.yml` are the source of truth.
If a figure is wrong, fix it in `config.yml` (or `config.example.yml` for
the demo) and rebuild; `build-patch.js` refuses a config whose figures do
not reconcile (income − spending ≠ saved, buckets ≠ net worth, a quarter's
saved ≠ its months, and so on).

## Workflows

### Install / update the patch
1. Edit `custom-budget/config.yml` (your figures, account names, goals,
   install settings) — or `actual-budget-tweaks.js.template` if the patch
   logic itself changes. Never edit the generated `actual-budget-tweaks.js`.
2. Run `./tests/run-tests.sh` until it passes (it builds the patch from
   `config.example.yml` first, then checks and tests it).
3. Run `install-tweaks.sh` (it builds the patch from `config.yml` if
   present, else `config.example.yml`; backs up, copies, adds the
   `<script>` tag if missing, and verifies). See `custom-budget/README.md`.
4. Hard-refresh the browser (Cmd/Ctrl+Shift+R) and check the Budget page.
   A brief flicker after edits is possible; the patch is idempotent.

### Verify the patch (on the server)
- `node --check` on the installed file (syntax).
- The `<script>` tag appears exactly once in `index.html`.
- The JS is served over HTTP (status 200).
- Grep the installed file for known-bad strings (wrong month/budget
  values, placeholder amounts, "Available funds") — expect zero.
- The pristine backup still exists.

### Roll back
Copy the pristine backup back over the build directory (or restore its
`index.html` and delete `actual-budget-tweaks.js`), then hard-refresh.

### Add / update rules
Rules are Actual's auto-categorization (stage `pre`). The two template rules
in `scripts/rules.template.js` are: a notes-based rule that files
investment-activity rows to the Investments category, and a payee-based rule
that files opening-balance rows to the Starting Balances category. There is
deliberately **no** rule for transfers (see constraint 6). After adding a
rule, probe it on a throwaway test account (add rows, re-read and match by
notes, verify the category, then delete the rows and the account). Never
leave a test account behind.

### Big changes: research-panel review
A significant change (a redesign, a new visualization, a data-model change)
goes through the research panel first: the strongest available models are
consulted on design, code structure, and tests; their opinions are recorded
with where they agree and where they split; a full-stack review and an
**antagonist** review (a pass whose job is to try to break the design and
find flaws) run before the build. Only then is the change implemented and
verified. Small fixes (a label, a threshold, a comment) do not need the
panel.

## Tests and CI

- `node custom-budget/build-patch.js custom-budget/config.example.yml` —
  build the patch from the template + demo config (validates the figures
  reconcile).
- `node --check custom-budget/actual-budget-tweaks.js` — syntax, on the
  generated patch.
- `node custom-budget/tests/test-tweaks.js` — the fake-DOM suite (Budget
  scenarios, Uncategorized transfer-row hiding, demo-figure reconciliation).
- `node custom-budget/tests/test-build.js` — the build-step tests (a valid
  config builds; a config that does not reconcile is rejected).
- `./custom-budget/tests/run-tests.sh` — all of the above, in one command.
- CI (`.github/workflows/ci.yml`) runs all of them on every push / pull
  request that touches `custom-budget/`, plus a check that no real-data
  markers (a personal hostname, a LAN address, a pasted API key) appear in
  the demo files.

When you change the patch, update the tests in the same change. When you
change a demo figure, change it in `config.example.yml` (the build
validates the reconciliation, and both suites assert the figures agree):
the buckets must still sum to the net worth, and income − spending must
still equal saved for every month.

## If something is blocked

- **No fork / no push access:** the fork must exist and the app must have
  access to it before anything can be pushed. If the fork cannot be created
  by the app, the user forks on the website and adds the fork to the app's
  repository selection; then push.
- **A live check is needed:** this repo has no live browser. A visual check
  is the user's hard refresh. Say so plainly; do not claim a browser check
  you did not do.
- **A write needs the API key:** ask the user for a fresh key (link them to
  the API key settings page). Do not reuse an old key and do not extract one
  from the server.
