# Actual Budget community research — top-starred projects

Researched Nov 26–27, 2026 via the GitHub MCP (search "actual budget", sorted by
stars; 2,064 repos total) plus the upstream forks list. All star counts are from
that search. This file is sanitized: no real figures, names, or hostnames — only
what each project is for and whether it fits a self-hosted Actual Budget setup
with a custom Budget-page patch, a per-task API-key workflow, Home Assistant,
and Plaid (read-only) for bank data.

## Top picks

1. **aelxxs/actual-budget-tweaks** — A browser extension / sidecar proxy that
   adds 30+ UI tweaks (themes, live sidebar, Budget Insights, Spending
   Calendar, Loan payoff). It is a more robust vehicle than an injected patch
   and already does much of what the v5 redesign wants. Evaluate it first.
2. **azimul-kabir/actua** — The native Android client (the household is on
   Android). Offline, widgets, receipt scanning, and a loan payoff planner.
   Try it on the phone.
3. **jlvcm/ha-actualbudget** — The Home Assistant integration. Surfaces
   account balances and the current month's budget as HA sensors. Try it.
4. **sakowicz/actual-ai** — AI transaction categorization that complements
   (not replaces) the existing rules. Dry-run first, with a free LLM provider.
5. **jhonderson/actual-http-api** — A clean HTTP/REST bridge to Actual
   (supports the scoped Actual API key as its credential). Consider it if
   HTTP or curl access to Actual is ever needed.

## Forks of actualbudget/actual — not where the value is

The top-starred forks of the upstream repo are all tiny (the most-starred has
5 stars) and are mostly unmodified mirrors. The one labelled an "AI analysis
fork" ships the stock upstream README with no evident customization. **Do not
spend time hunting forks for customizations** — the useful work lives in the
standalone community projects below, not in forks of the upstream.

## Findings that should change the approach

### The v5 patch vehicle: consider ABT's sidecar instead of the injected patch

The injected JS patch is wiped by any Actual reinstall or update (the package
manager / updater replaces the built bundle). `aelxxs/actual-budget-tweaks`
offers the same kind of UI changes as a **sidecar proxy** (a small container
in front of the Actual server that injects the tweaks) or as a browser
extension. The sidecar survives server updates and works in every browser
without an extension. That is a materially better vehicle for the v5 UI work
than patching the built bundle on the server. **Recommendation:** evaluate
ABT's sidecar before investing more in the injected patch. If it covers the
v5 goals (or can be extended), prefer it. At minimum, borrow its ideas for
v5 — see the ABT section below. The v5 panel should be told about ABT.

### The Actual connector: MCP servers are the cleanest tool, but they conflict with the standing rule

Both `s-stefanov/actual-mcp` and `agigante80/actual-mcp-server` expose a rich,
machine-readable tool surface (net worth, monthly summary, budget-vs-actual,
cash flow, categories, payees, rules, dashboards). They are the cleanest way
for an AI agent to work with Actual, and they support session-token auth for
OpenID/Google-login servers. **But** they run as a standing server holding a
persistent credential (password or session token), which conflicts with the
standing rule that budget-data access stays per-task and transient (a fresh
API key pasted per task, never stored). **Do not adopt either MCP server as a
standing connector.** Keep the per-task API-key approach. Use the MCP servers
only as a reference for what tool surface an agent needs, and note that
session-token auth is the correct model for OpenID servers.

### AI categorization complements rules — it does not replace them

`sakowicz/actual-ai` passes the existing rules to the LLM and can apply a
rule's category, so it works *with* the rule set rather than against it. It
is best for new or ambiguous merchants that no rule covers. Run it in
dry-run first and use a free LLM provider. It runs as a self-hosted container
with its own credential, which is a separate decision from the agent-connector
rule.

---

## Per-repo notes

### aelxxs/actual-budget-tweaks — 149 stars, TypeScript, updated Nov 26, 2026, actively maintained
**What it is:** A community collection of 30+ UI tweaks for Actual Budget,
installed as a browser extension (Firefox / Chrome Web Store) or as a
self-hosted sidecar proxy (Docker) in front of the Actual server. Each tweak
is a setting you turn on; Actual works as before with it off. MIT license.
Built with AI assistance and checked against a running Actual instance with
Playwright; it has its own agent guide (AGENTS.md).
**Features:** themes (community themes, palette editor, separate light/dark
picks); live sidebar (live balances, account groups, search, pinned
shortcuts); Budget Insights side panel (where the month stands, how ready
next month is, priority planning); Spending Calendar (daily spending and
upcoming schedules on a month calendar); reconcile panel and sync recap;
Loan payoff (when a debt clears, what it costs, what-if payments, next
payment split into principal and interest); privacy styles (hide amounts as
scribbles or dots).
**Useful? Yes — the most important find.** It overlaps heavily with the v5
redesign goals (a net-worth / savings-goal / month-status panel, a calendar,
a loan-payoff view) and its sidecar is a better delivery vehicle than the
injected patch. **Recommendation: use it / borrow ideas.** Evaluate the
sidecar first; borrow Budget Insights, Spending Calendar, and Loan payoff for
v5 either way. It does not do the household's specific net-worth-including-
home or allocation-strip figures, so the custom panel is not fully replaced —
but the vehicle and several features are.

### sakowicz/actual-ai — 548 stars, TypeScript, updated Nov 25, 2026, actively maintained
**What it is:** AI transaction categorization for Actual Budget (Docker).
Supports OpenAI, Anthropic, Google Generative AI, Ollama, OpenRouter,
Requesty, UberLLM, and Groq. Classifies uncategorized transactions on a cron
schedule; marks guesses in notes; marks unclassifiable ones so they are not
retried; can suggest and create new categories; optional web search for
unfamiliar merchants; dry-run mode. It reads the existing rules and passes
them to the LLM, which may reply with a rule's category.
**Useful? Yes, as a complement.** The rule set already covers the regular
merchants; this is for new or ambiguous ones. **Recommendation: try it.**
Run in dry-run first, use a free provider, and keep the existing rules as
the primary path. Note it needs its own credential in the container and it
sends transaction descriptions to the chosen LLM provider.

### s-stefanov/actual-mcp — 296 stars, TypeScript, updated Nov 26, 2026, actively maintained (100 forks, 53 open issues)
**What it is:** An MCP server for Actual Budget (npm / Docker, stdio or
HTTP/SSE). Tools for transactions, accounts, balance history,
spending-by-category, monthly summary, budget-vs-actual, net worth,
category trends, spending-by-payee, cash flow, custom reports, dashboards
and widgets, categories, payees, and rules (get/create/update/delete).
Supports password auth or a session token for OpenID servers. Published to
the official MCP Registry.
**Useful? As a reference, not as a standing connector.** See the findings
above: it is the cleanest agent tool surface, but a standing server holding
a persistent credential conflicts with the per-task, transient API-key rule.
**Recommendation: borrow ideas / skip adoption.** Do not wire it in as a
persistent connector.

### agigante80/actual-mcp-server — 83 stars, JavaScript/TypeScript, updated Nov 26, 2026, actively maintained (33 forks)
**What it is:** Another MCP server for Actual Budget (89 tools for
transactions, budgets, rules, and bank sync). Works with Claude Desktop,
Claude Code, Cursor, VS Code Copilot, Gemini CLI, Codex CLI (stdio) and
LibreChat/LobeChat (HTTP/Docker). It confirms with the user before making
changes. Published to npm, Docker Hub, and the official MCP Registry.
**Useful? Same as s-stefanov/actual-mcp.** The confirmation-first flow for
writes is a nice safety pattern worth borrowing. **Recommendation: borrow
ideas / skip adoption** as a standing connector, for the same credential
reason.

### jlvcm/ha-actualbudget — 155 stars, Python, updated Nov 9, 2026, maintained (HACS)
**What it is:** A Home Assistant custom integration (via HACS). Exposes all
account balances as sensors and all budgets with the current month as
sensors (last month and total as attributes).
**Useful? Yes.** It is the direct path to budget data in Home Assistant,
which the household wants. **Recommendation: try it.** Note it authenticates
with the server password (plus the budget file id and an optional cert
setting); the server uses OpenID/Google login with password as a fallback,
so the password must be set for this to connect.

### hail2victors/n8n-Actual-Automation — 131 stars, JavaScript, updated Nov 16, 2026
**What it is:** Six n8n workflows for Actual Budget: Discovery (fetch
account/category IDs), Sunday Financial Briefing (weekly AI summary via
Telegram), Monthly Auto-Fund Envelopes (fund categories on the 1st),
AI Transaction Categorizer (three-tier confidence: auto-apply, auto-create
a rule, or alert for review), Friday Paycheck Summary, and Monthly Rule
Digest (pattern analysis, logged to Notion). Requires n8n, a SimpleFIN
bridge + auto-sync for bank data, an Anthropic (or OpenRouter) key, and
Telegram.
**Useful? Borrow the ideas, do not adopt the stack.** The household does
not run n8n and does not use SimpleFIN (bank data comes via Plaid). The
best ideas to borrow: the confidence-tier categorizer (auto-apply at one
threshold, auto-create a rule at a higher one, alert below) and the weekly
AI briefing / monthly rule digest. **Recommendation: borrow ideas / skip.**

### jhonderson/actual-http-api — 262 stars, JavaScript, updated Nov 16, 2026, actively maintained
**What it is:** A lightweight HTTP/REST wrapper around the Actual Budget
Node.js API (Docker, Swagger UI). Lets non-Node clients (curl, Python,
Home Assistant REST, n8n) talk to Actual. It has its own API key for
callers and authenticates to Actual with a password, a session token, or a
scoped Actual API key (the scoped key is the better choice where available).
Includes examples such as updating investment-account balances.
**Useful? Consider it.** The household already uses the Node API directly,
so this is not needed today — but it is the cleanest HTTP bridge if HTTP /
curl access is ever wanted, and its support for the scoped Actual API key
aligns with the per-task key model. **Recommendation: consider / borrow.**
The investment-balance update example is worth a look.

### azimul-kabir/actua — 75 stars, Kotlin, updated Nov 26, 2026, actively maintained (Google Play)
**What it is:** A native Android client for Actual Budget (Material You,
Jetpack Compose). Connects to a self-hosted server, keeps a local copy for
offline use, and syncs. Envelope and tracking budgets, targets, automations,
one-tap cover for overspent categories, transactions with splits/transfers/
merging/reconciliation, rules and auto-categorization, receipt scanning,
bank sync through the Actual server, imports (CSV/OFX/QFX/QIF/CAMT.053/
XLSX/PDF/SMS), scheduled transactions, a Bills calendar, credit cards, loans
with a payoff planner, dashboards and custom reports, home-screen widgets,
app lock, and encrypted backups. GPLv3. Reviewed against Actual 26.11.
**Useful? Yes.** The household is on Android, and this is the native Android
client. The loan payoff planner and widgets are directly relevant.
**Recommendation: try it** (on Google Play / Obtainium / APK).

### BearTS/actual-budget-app — 283 stars, Swift, updated Nov 23, 2026
**What it is:** A native iOS SwiftUI client for Actual Budget (dashboard,
accounts, transactions, budget). It talks to Actual through
`actual-http-api`. Custom "Personal Use Only" license (no commercial use or
distribution).
**Useful? No.** iOS only, and the household is on Android. **Recommendation:
skip.** (The Android counterpart is `actua`, above.)

### MattFaz/actuali — 253 stars, Swift, updated Nov 27, 2026 (App Store / TestFlight)
**What it is:** A native iOS companion app that talks directly to a
self-hosted Actual server using the same CRDT sync protocol as Actual's own
clients. Fully offline with a local SQLite copy, rules run on phone-logged
transactions, reports render with real data, Siri/Shortcuts can log a
purchase. MIT license.
**Useful? No.** iOS only. **Recommendation: skip.** Notable only as the
best-implemented mobile client architecture (native CRDT sync, no middleman).

### seriouslag/actual-auto-sync — 96 stars, TypeScript, updated Nov 21, 2026
**What it is:** A background service (Docker) that auto-runs Actual's bank
sync on a cron schedule. Multiple budgets, E2E encryption support,
self-healing retries, per-account sync, Docker secrets, Apprise
notifications (sync failures, new uncategorized transactions), and
heartbeat URLs for monitors.
**Useful? No.** The household does not use Actual's bank sync (bank data
comes via Plaid through the agent into the Actual API, and Actual has no
bank feed configured for these accounts), so there is nothing for it to
sync. **Recommendation: skip.** The Apprise-notification and heartbeat
patterns are worth borrowing for the household's own scheduled jobs.

### lunchflow/actual-flow — 62 stars, TypeScript, updated Oct 28, 2026
**What it is:** Import transactions from Lunch Flow (GoCardless, Finicity,
MX, Finverse) into Actual Budget. **Deprecated** — Actual now connects to
Lunch Flow through its built-in SimpleFIN bank sync.
**Useful? No.** Deprecated, and the household uses Plaid, not Lunch Flow /
SimpleFIN. **Recommendation: skip.** It confirms the built-in SimpleFIN
path is the way to go if bank sync inside Actual is ever wanted.

### 2manyvcos/enable-actual — 115 stars, TypeScript, updated Nov 15, 2026
**What it is:** Import transactions from European banks into Actual Budget
via Enable Banking (PSD2 APIs, free for personal use, read-only). Docker,
web UI, multiple accounts, ntfy notifications.
**Useful? No.** European banks only; the household's banks are in the US.
**Recommendation: skip.**

### eatonc/actual-gcp — 101 stars, HCL, updated Nov 25, 2026
**What it is:** Host Actual Budget on Google Cloud's always-free tier
(Compute Engine + Docker + Terraform + DuckDNS + Caddy).
**Useful? No.** The household already self-hosts on its own Proxmox host.
**Recommendation: skip.**

### sztupy/hassio-actualbudget — 60 stars, updated Nov 11, 2026
**What it is:** A Home Assistant add-on repository to *run* Actual Budget
as a Home Assistant add-on (with DuckDNS, MariaDB, Nginx Proxy Manager).
**Useful? No.** This is about hosting Actual inside Home Assistant; the
household already self-hosts Actual separately. **Recommendation: skip.**
(The integration that *surfaces* budget data in Home Assistant is
`ha-actualbudget`, above.)

### MattFaz/actualtap (113 stars) and bobokun/actualtap-py (90 stars, Python)
**What it is:** Auto-create transactions in Actual Budget when Tap-to-Pay
is used on a mobile device.
**Useful? No.** The household's transactions already arrive via Plaid, so
auto-creating them from taps would duplicate entries. **Recommendation:
skip.**

### actualbudget/docs — 180 stars (archived)
The upstream documentation repo, now archived. Not a community project.
Ignore.

## Sources

- GitHub search "actual budget", sorted by stars (2,064 repos), via the
  GitHub MCP, Nov 26–27, 2026.
- Upstream forks list via the GitHub REST API
  (`/repos/actualbudget/actual/forks?sort=stargazers`), Nov 27, 2026.
- Each README above was read via the GitHub MCP `get_file_contents`.
