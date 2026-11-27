#!/usr/bin/env node
/**
 * Test the sanitized actual-budget-tweaks.js (v4, demo/template) in Node
 * under a fake DOM. All fixtures use placeholder/demo figures and generic
 * account names — no real data. See custom-budget/README.md.
 * Loads the script source, injects an export hook for its internals,
 * builds a fake Budget page and a fake Uncategorized transactions view,
 * and asserts the compact layout, the validated Spent reader, the
 * savings goal, the net-worth strip, and the transfer-row hiding.
 * Usage: node test-tweaks.js  (or: npm test / ./run-tests.sh)
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'actual-budget-tweaks.js'),
  'utf8',
);

let failures = 0;
function check(name, cond, extra) {
  if (cond) {
    console.log('  ok - ' + name);
  } else {
    failures++;
    console.log('  FAIL - ' + name + (extra !== undefined ? ' :: ' + extra : ''));
  }
}
function near(a, b) {
  return Math.abs(a - b) < 0.005;
}

// ---- Fake DOM (textContent concatenates descendants, like the real DOM) ----
const registry = [];
class FakeEl {
  constructor(opts) {
    opts = opts || {};
    this._text = opts.text || '';
    this.children = opts.children || [];
    this.parentElement = null;
    this.style = {};
    this._testid = opts.testid || null;
    this._attrs = {};
    this.id = opts.id || '';
    this.nodeType = 1;
    this.onclick = null;
    for (const c of this.children) c.parentElement = this;
    registry.push(this);
  }
  // Real DOM: textContent is the element's own direct text PLUS all
  // descendant text, concatenated with no separator. (_text is the
  // direct text; children contribute theirs.)
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join('');
  }
  set textContent(v) {
    this._text = v == null ? '' : String(v);
    for (const c of this.children) c.parentElement = null;
    this.children = [];
  }
  get nextSibling() {
    if (!this.parentElement) return null;
    const sibs = this.parentElement.children;
    const i = sibs.indexOf(this);
    return i >= 0 && i + 1 < sibs.length ? sibs[i + 1] : null;
  }
  getAttribute(name) {
    if (name === 'data-testid') return this._testid;
    if (name === 'id') return this.id || null;
    return this._attrs[name] !== undefined ? this._attrs[name] : null;
  }
  setAttribute(name, val) {
    if (name === 'id') {
      this.id = val;
      return;
    }
    this._attrs[name] = val;
  }
  appendChild(child) {
    // Real DOM: inserting a node that already has a parent MOVES it.
    if (child.parentElement) {
      const old = child.parentElement.children;
      const oi = old.indexOf(child);
      if (oi !== -1) old.splice(oi, 1);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  insertBefore(child, ref) {
    // Real DOM: inserting a node that already has a parent MOVES it.
    if (child.parentElement) {
      const old = child.parentElement.children;
      const oi = old.indexOf(child);
      if (oi !== -1) old.splice(oi, 1);
    }
    child.parentElement = this;
    if (!ref) {
      this.children.push(child);
      return child;
    }
    const i = this.children.indexOf(ref);
    if (i === -1) this.children.push(child);
    else this.children.splice(i, 0, child);
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i !== -1) this.children.splice(i, 1);
    child.parentElement = null;
    return child;
  }
  _walk(fn) {
    fn(this);
    for (const c of this.children) c._walk(fn);
  }
  _find(pred) {
    if (pred(this)) return this;
    for (const c of this.children) {
      const r = c._find(pred);
      if (r) return r;
    }
    return null;
  }
  querySelector(sel) {
    const m = /\[data-testid="([^"]+)"\]/.exec(sel || '');
    if (!m) return null;
    return this._find((e) => e._testid === m[1]);
  }
  querySelectorAll(sel) {
    if (sel === '*') {
      const out = [];
      this._walk((e) => out.push(e));
      return out;
    }
    const m = /\[data-testid="([^"]+)"\]/.exec(sel || '');
    if (!m) return [];
    const out = [];
    this._walk((e) => {
      if (e._testid === m[1]) out.push(e);
    });
    return out;
  }
}

function makeDoc(root) {
  return {
    readyState: 'complete',
    body: root,
    getElementById: (id) => {
      for (const e of registry) if (e.id === id) return e;
      return null;
    },
    createElement: () => new FakeEl({}),
    getElementsByTagName: (tag) => (tag === '*' ? registry.slice() : []),
    querySelector: (sel) => root.querySelector(sel),
    querySelectorAll: (sel) => root.querySelectorAll(sel),
    addEventListener: () => {},
  };
}

function leaf(text) {
  return new FakeEl({ text });
}

function buildBudgetDoc(opts) {
  opts = opts || {};
  registry.length = 0;
  const root = new FakeEl({ children: [] });
  const doc = makeDoc(root);

  // Month selector: a row of abbreviations; the selected month is indicated.
  const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
  const selector = new FakeEl({ children: [] });
  for (const m of months) {
    const b = new FakeEl({ text: m });
    if (opts.selectedMonthAbbr === m) {
      b.setAttribute('aria-current', 'true');
      b.style.backgroundColor = '#7e57c2';
    }
    selector.children.push(b);
    b.parentElement = selector;
  }
  root.children.push(selector);
  selector.parentElement = root;

  // Summary card with the month title + "Overspent in Oct" line.
  const summary = new FakeEl({ testid: 'budget-summary', children: [] });
  const card = new FakeEl({
    children: [leaf(opts.summaryMonth || 'November'), summary],
  });
  // Overspent line (label + value columns, like the real summary).
  const overLabel = leaf('Overspent in Oct');
  const overValue = leaf('-1,234.56');
  summary.children.push(overLabel, overValue);
  overLabel.parentElement = summary;
  overValue.parentElement = summary;
  root.children.push(card);
  card.parentElement = root;

  // Budget table with header row.
  const table = new FakeEl({ testid: 'budget-table', children: [] });
  root.children.push(table);
  table.parentElement = root;
  if (opts.header !== false) {
    const mkCol = (label, value) =>
      new FakeEl({ children: [leaf(label), leaf(value)] });
    const header = new FakeEl({
      children: [
        leaf('Category'),
        mkCol('Budgeted', opts.budgeted || '7,500.00'),
        mkCol('Spent', opts.spent || '-5,000.00'),
        mkCol('Balance', '2,500.00'),
      ],
    });
    table.children.push(header);
    header.parentElement = table;
  }

  // Scroll container with group rows. Real Actual desktop DOM is FLAT:
  // group headers and category rows are siblings (the header is a bare
  // row; category rows carry data-testid="category-name"). Bills & Home
  // first, Income last — the patch must move Income to the top.
  const scroll = new FakeEl({ testid: 'budget-table-scroll-container', children: [] });
  table.children.push(scroll);
  scroll.parentElement = table;
  const mkGroupHeader = (name) => new FakeEl({ children: [leaf(name)] });
  const mkCatRow = (name) =>
    new FakeEl({
      children: [new FakeEl({ testid: 'category-name', text: name })],
    });
  const flatRows = [
    mkGroupHeader('Bills & Home'),
    mkCatRow('Lawn care'),
    mkCatRow('Car'),
    mkGroupHeader('Income'),
    mkCatRow('Income'),
    mkCatRow('Starting Balances'),
  ];
  for (const r of flatRows) {
    scroll.children.push(r);
    r.parentElement = scroll;
  }

  // Demo sidebar accounts (25 generic accounts, placeholder balances).
  if (opts.sidebar !== false) {
    // Demo sidebar accounts (generic names, placeholder balances).
    // Card E carries a small positive credit, which the sum handles.
    const accounts = [
      ['Retirement Account A', '180,000.00'],
      ['Retirement Account B', '95,000.00'],
      ['Brokerage Account A', '75,000.00'],
      ['Brokerage Account B', '40,000.00'],
      ['Brokerage Account C', '5,000.00'],
      ['Cash Account A', '110,000.00'],
      ['Cash Account B', '12,000.00'],
      ['Cash Account C', '11,000.00'],
      ['Cash Account D', '2,000.00'],
      ['Cash on hand', '500.00'],
      ['Card A', '-1,500.00'],
      ['Card B', '-800.00'],
      ['Card C', '-600.00'],
      ['Card D', '-500.00'],
      ['Card E', '50.00'],
      ['Card F', '-300.00'],
      ['Card G', '-250.00'],
      ['Card H', '-100.00'],
      ['Mortgage', '-850,000.00'],
      ['House down payment', '400,000.00'],
      ['Other Account A', '25,000.00'],
      ['Other Account B', '5,000.00'],
      ['Other Account C', '1,500.00'],
      ['Other Account D', '250.00'],
      ['Other Account E', '100.00'],
    ];
    const sidebar = new FakeEl({ children: [] });
    for (const [name, bal] of accounts) {
      const row = new FakeEl({
        children: [
          new FakeEl({ testid: 'account-name', text: name }),
          new FakeEl({ testid: 'account-balance', text: bal }),
        ],
      });
      sidebar.children.push(row);
      row.parentElement = sidebar;
    }
    root.children.push(sidebar);
    sidebar.parentElement = root;
  }
  return { doc, root, table, scroll };
}

function loadScript(doc) {
  global.document = doc;
  global.window = { MutationObserver: undefined };
  const hook =
    '; globalThis.__actualTweaks = { compactAdditionsHTML: compactAdditionsHTML, ensureAdditions: ensureAdditions, ' +
    'computeBuckets: computeBuckets, monthlyBarsSVG: monthlyBarsSVG, goalTrackerHTML: goalTrackerHTML, ' +
    'readSpent: readSpent, readTableHeaderValues: readTableHeaderValues, readSelectedMonth: readSelectedMonth, ' +
    'isTransferRow: isTransferRow, findRowsInTable: findRowsInTable, rowForIcon: rowForIcon, ' +
    'applyTransfers: applyTransfers, isUncategorizedView: isUncategorizedView, fmt: fmt, ' +
    'YEAR: YEAR, GOALS: GOALS, FALLBACK: FALLBACK, ' +
    '__getTransfersHidden: function(){ return transfersHidden; }, ' +
    '__setTransfersHidden: function(v){ transfersHidden = v; } };';
  const idx = SRC.lastIndexOf('})();');
  if (idx === -1) throw new Error('could not find IIFE tail to hook');
  const src = SRC.slice(0, idx) + hook + SRC.slice(idx);
  eval(src); // eslint-disable-line no-eval
  return global.__actualTweaks;
}

// ================= Scenario 1: Budget, live sidebar + correct header =================
console.log('Scenario 1: Budget page, live sidebar + correct November header');
const b1 = buildBudgetDoc({ selectedMonthAbbr: 'Nov' });
const t1 = loadScript(b1.doc);
const bk1 = t1.computeBuckets();
check('retirement total', near(bk1.retirement, 275000), bk1.retirement);
check('brokerage total', near(bk1.brokerage, 120000), bk1.brokerage);
check('net spendable', near(bk1.netSpendable, 131500), bk1.netSpendable);
check('home equity', near(bk1.homeEquity, 350000), bk1.homeEquity);
check('other total (no placeholder)', near(bk1.other, 31850), bk1.other);
check('net worth incl home reconciles', near(bk1.netWorth, 908350), bk1.netWorth);
check('placeholder NOT counted', !near(bk1.netWorth, 908350 + 400000), bk1.netWorth);
check('allLive true', bk1.allLive === true);
const s1 = t1.readSpent();
check('spent live November', s1.month === 'November' && s1.live === true, JSON.stringify(s1));
check('spent live values', near(s1.spent, 5000) && near(s1.budget, 7500), JSON.stringify(s1));
const html1 = t1.compactAdditionsHTML(bk1, s1);
check('additions has savings goal at top', html1.indexOf('Savings goal') !== -1 && html1.indexOf('Savings goal') < html1.indexOf('Total net worth'), 'goal not first');
check('additions has net worth strip', html1.indexOf('Total net worth') !== -1 && html1.indexOf('$908,350.00') !== -1);
check('additions has May line', html1.indexOf('essentially back to the May amount') !== -1 && html1.indexOf('$481,500.00') !== -1 && html1.indexOf('1,500.00') !== -1);
check('additions has bucket detail line (not a tall list)', html1.indexOf('Brokerage $120,000.00') !== -1 && html1.indexOf('Home equity $350,000.00') !== -1);
check('additions shows Spent in November, under budget', html1.indexOf('Spent in November') !== -1 && html1.indexOf('$5,000.00') !== -1 && html1.indexOf('$2,500.00 left') !== -1);
check('additions never says over budget when under', html1.indexOf('over budget') === -1);
check('additions has no Available funds', html1.indexOf('Available funds') === -1);
check('additions has no standalone saved-year number', html1.indexOf('Saved in') === -1);
check('additions has no House down payment', html1.indexOf('House down payment') === -1);
check('additions has no 400,000 (placeholder not shown)', html1.indexOf('400,000') === -1);
check('additions has no 4,999.99 (wrong-budget value)', html1.indexOf('4,999.99') === -1);
check('additions has no Spent in October', html1.indexOf('Spent in October') === -1);
check('additions has goal bars', html1.indexOf('Q2 (May') !== -1 && html1.indexOf('12,000.00') !== -1 && html1.indexOf('Q3 (Jul') !== -1 && html1.indexOf('Q4 (Oct') !== -1 && html1.indexOf('9,000.00') !== -1);
check('additions says behind pace + model note', html1.indexOf('Behind pace for the year') !== -1 && html1.indexOf('model, not a promise') !== -1);
check('additions has monthly bar strip', html1.indexOf('Monthly income vs spending') !== -1 && html1.indexOf('May') !== -1 && html1.indexOf('Nov') !== -1);
check('additions has NO category donut (dropped for compactness)', html1.indexOf('Spending by category') === -1);
check('additions is compact (much shorter than the v3 tall panel)', html1.length < 9000, html1.length);
check('down payment is $400,000 (demo) in FALLBACK', t1.FALLBACK.downPayment === 400000, t1.FALLBACK.downPayment);
const bars1 = t1.monthlyBarsSVG();
check('bar strip is compact (H=132)', bars1.indexOf('viewBox="0 0 660 132"') !== -1);
check('bar strip has saved labels', bars1.indexOf('16,000.00') !== -1 && bars1.indexOf('7,000.00') !== -1);
// ensureAdditions inserts the compact block (and the old tall panel is gone).
const block1 = b1.doc.getElementById('actual-compact-additions');
check('compact block inserted above the table', !!block1 && block1.parentElement === b1.table, block1 ? 'inserted' : 'missing');
check('old tall panel removed / absent', !b1.doc.getElementById('actual-money-breakdown'));
if (block1) {
  check('block style has no border/background', (block1.getAttribute('style') || '').indexOf('border') === -1 && (block1.getAttribute('style') || '').indexOf('background') === -1, block1.getAttribute('style'));
  check('block style has no position fixed/sticky', (block1.getAttribute('style') || '').indexOf('position') === -1);
  check('block style has no overflow hidden', (block1.getAttribute('style') || '').indexOf('overflow') === -1);
  check('block style has no fixed height', (block1.getAttribute('style') || '').indexOf('height') === -1);
}
// Income moved to the top of the scroll container.
const firstRow = b1.scroll.children[0];
check('Income group moved to top', firstRow && firstRow.textContent.indexOf('Income') !== -1, firstRow ? firstRow.textContent.slice(0, 40) : 'none');
// Summary card still present (original card not hidden/replaced).
check('original summary card still present', !!b1.doc.querySelector('[data-testid="budget-summary"]'));

// ================= Scenario 2: Spent validation — wrong month =================
console.log('Scenario 2: Spent validation — October title must fall back');
const b2 = buildBudgetDoc({ selectedMonthAbbr: null, summaryMonth: 'October' });
const t2 = loadScript(b2.doc);
const s2 = t2.readSpent();
check('October month falls back to baked-in November', s2.month === 'November' && s2.live === false && near(s2.spent, 5000) && near(s2.budget, 7500), JSON.stringify(s2));
const html2 = t2.compactAdditionsHTML(t2.computeBuckets(), s2);
check('October render shows Spent in November, never October', html2.indexOf('Spent in November') !== -1 && html2.indexOf('Spent in October') === -1);
check('October render has no 4,999.99', html2.indexOf('4,999.99') === -1);

// ================= Scenario 3: Spent validation — wrong budget ($4,999.99) =================
console.log('Scenario 3: Spent validation — wrong budget must fall back');
const b3 = buildBudgetDoc({ selectedMonthAbbr: 'Nov', budgeted: '4,999.99' });
const t3 = loadScript(b3.doc);
const s3 = t3.readSpent();
check('wrong budget falls back to baked-in', s3.live === false && near(s3.spent, 5000) && near(s3.budget, 7500), JSON.stringify(s3));
const html3 = t3.compactAdditionsHTML(t3.computeBuckets(), s3);
check('wrong-budget render shows $2,500.00 left, not over budget', html3.indexOf('$2,500.00 left') !== -1 && html3.indexOf('over budget') === -1);
check('wrong-budget render has no 4,999.99', html3.indexOf('4,999.99') === -1);

// ================= Scenario 4: Spent validation — no header =================
console.log('Scenario 4: Spent validation — unreadable header falls back');
const b4 = buildBudgetDoc({ selectedMonthAbbr: 'Nov', header: false });
const t4 = loadScript(b4.doc);
const s4 = t4.readSpent();
check('no header falls back', s4.live === false && s4.month === 'November', JSON.stringify(s4));

// ================= Scenario 5: Spent genuinely over budget =================
console.log('Scenario 5: Spent genuinely over budget shows over budget');
const b5 = buildBudgetDoc({ selectedMonthAbbr: 'Nov', spent: '-8,000.00' });
const t5 = loadScript(b5.doc);
const s5 = t5.readSpent();
check('over-budget reads live', s5.live === true && near(s5.spent, 8000) && near(s5.budget, 7500), JSON.stringify(s5));
const html5 = t5.compactAdditionsHTML(t5.computeBuckets(), s5);
check('over-budget render says over budget', html5.indexOf('$500.00 over budget') !== -1, html5.slice(html5.indexOf('Spent in'), html5.indexOf('Spent in') + 200));

// ================= Scenario 6: Uncategorized — hide transfer rows =================
console.log('Scenario 6: Uncategorized view — transfer rows hidden, total recomputed');
function buildUncatDoc() {
  registry.length = 0;
  const root = new FakeEl({ children: [] });
  const doc = makeDoc(root);
  const heading = leaf('Uncategorized');
  root.children.push(heading);
  heading.parentElement = root;
  const totalEl = new FakeEl({ testid: 'transactions-balance', text: '-414,292.50' });
  root.children.push(totalEl);
  totalEl.parentElement = root;
  const page = new FakeEl({ children: [] });
  root.children.push(page);
  page.parentElement = root;
  const table = new FakeEl({ testid: 'transaction-table', children: [] });
  page.children.push(table);
  table.parentElement = page;
  const header = new FakeEl({
    testid: 'transaction-table-header',
    children: ['Date', 'Account', 'Payee', 'Notes', 'Category', 'Payment', 'Deposit'].map((h) => leaf(h)),
  });
  table.children.push(header);
  header.parentElement = table;
  const list = new FakeEl({ children: [] });
  table.children.push(list);
  list.parentElement = table;
  const mkRow = (cells, isTransfer) => {
    const row = new FakeEl({ children: cells.map((c) => leaf(c)) });
    if (isTransfer) {
      // Actual tags transfer rows with a transfer-icon inside the payee cell.
      const icon = new FakeEl({ testid: 'transfer-icon', text: '' });
      const payeeCell = row.children[2];
      payeeCell.children.push(icon);
      icon.parentElement = payeeCell;
    }
    list.children.push(row);
    row.parentElement = list;
    return row;
  };
  // Transfer rows (demo data).
  const r1 = mkRow(['11/16/2027', 'Cash Account B', '\u2192 Mortgage', 'transfer: mortgage payment', 'Categorize', '6,000.00', ''], true);
  const r2 = mkRow(['11/16/2027', 'Card B', '\u2192 Other Account D', 'transfer: card payment', 'Categorize', '200.00', ''], true);
  const r3 = mkRow(['11/05/2027', 'Cash Account C', '\u2192 Brokerage Account A', 'transfer: cash to brokerage', 'Categorize', '10,000.00', ''], true);
  const r4 = mkRow(['11/03/2027', 'Cash Account A', '\u2190 Other Account A', 'transfer: other account', 'Categorize', '', '2,000.00'], true);
  const r5 = mkRow(['05/08/2027', 'Cash Account A', '\u2192 House down payment', 'House down payment', 'Categorize', '400,000.00', ''], true);
  // Genuinely uncategorized rows (must stay visible).
  const r6 = mkRow(['11/26/2027', 'Mortgage', 'Mortgage Servicer', 'Mortgage principal adjustment', 'Categorize', '', ''], false);
  const r7 = mkRow(['11/20/2027', 'Cash Account C', 'Merchant X', 'Groceries', 'Categorize', '92.50', ''], false);
  return { doc, root, table, list, totalEl, rows: [r1, r2, r3, r4, r5, r6, r7] };
}
const u1 = buildUncatDoc();
const t6 = loadScript(u1.doc);
check('Uncategorized view detected', t6.isUncategorizedView() === true);
const foundRows = t6.findRowsInTable(u1.table);
check('findRowsInTable finds all 7 rows', foundRows.length === 7, foundRows.length);
check('transfer row detected by icon', t6.isTransferRow(u1.rows[0]) === true);
check('transfer row detected by arrow payee', t6.isTransferRow(u1.rows[1]) === true);
check('non-transfer row not flagged', t6.isTransferRow(u1.rows[5]) === false && t6.isTransferRow(u1.rows[6]) === false);
t6.applyTransfers();
check('transfer rows hidden', u1.rows.slice(0, 5).every((r) => r.style.display === 'none'), u1.rows.slice(0, 5).map((r) => r.style.display).join(','));
check('genuine rows stay visible', u1.rows[5].style.display !== 'none' && u1.rows[6].style.display !== 'none');
const note1 = u1.doc.getElementById('actual-transfer-note');
check('transfer note inserted above the table', !!note1 && note1.parentElement === u1.table.parentElement, note1 ? 'inserted' : 'missing');
if (note1) {
  check('note says 5 transfers hidden', (note1.children[0].textContent || '').indexOf('5 transfers hidden') !== -1, note1.children[0].textContent);
  check('note button says Show transfers', note1.children[1].textContent === 'Show transfers', note1.children[1].textContent);
}
// Row amounts sum to -414,292.50 (the view total). Hidden transfer sum:
// -(6000+200+10000-2000+400000) = -414,200.00, so the visible total
// is -414,292.50 - (-414,200.00) = -92.50 (the Merchant X row alone).
check('total recomputed from visible rows', u1.totalEl.textContent === '-92.50', u1.totalEl.textContent);
// Toggle: show transfers again.
note1.children[1].onclick();
check('toggle shows transfer rows', u1.rows.slice(0, 5).every((r) => r.style.display !== 'none'));
check('toggle restores original total', u1.totalEl.textContent === '-414,292.50', u1.totalEl.textContent);
check('toggle button now says Hide transfers', note1.children[1].textContent === 'Hide transfers');
note1.children[1].onclick();
check('toggle hides them again', u1.rows.slice(0, 5).every((r) => r.style.display === 'none'));
check('toggle recomputes total again', u1.totalEl.textContent === '-92.50', u1.totalEl.textContent);

// ================= Scenario 7: Uncategorized — unrecognisable structure no-ops =================
console.log('Scenario 7: Uncategorized view with unrecognisable rows no-ops safely');
registry.length = 0;
const root7 = new FakeEl({ children: [] });
const doc7 = makeDoc(root7);
root7.children.push(leaf('Uncategorized'));
const table7 = new FakeEl({ testid: 'transaction-table', children: [] });
root7.children.push(table7);
table7.parentElement = root7;
// A row with no date, no icon, no arrow — must not be hidden and must not throw.
const weird = new FakeEl({ children: [leaf('something'), leaf('else')] });
table7.children.push(weird);
weird.parentElement = table7;
const t7 = loadScript(doc7);
let threw = false;
try {
  t7.applyTransfers();
} catch (e) {
  threw = true;
}
check('unrecognisable structure does not throw', threw === false);
check('unrecognisable row not hidden', weird.style.display !== 'none');


// ================= Reconciliation: demo figures must agree =================
console.log('Reconciliation: demo figures agree with each other');
const fy = t1.YEAR.monthly;
let monthsOk = true;
for (const m of fy) {
  if (!near(m.income - m.spending, m.saved)) monthsOk = false;
}
check('each month: income - spending = saved', monthsOk);
const qSum = t1.GOALS.quarters.reduce((a, q) => a + q.saved, 0);
check('quarterly saved sums to year-to-date', near(qSum, t1.GOALS.yearToDate), qSum);
const fb = t1.FALLBACK;
const ret = fb.retirementA + fb.retirementB;
const brok = fb.brokerageA + fb.brokerageB + fb.brokerageC;
const bank = fb.cashA + fb.cashB + fb.cashC + fb.cashD;
const netSpend = bank + fb.cashOnHand - fb.cardsOwed;
const homeEq = fb.homeValue + fb.mortgageOwed;
const oth = fb.otherA + fb.otherB + fb.otherC + fb.otherD + fb.otherE;
const nw = brok + netSpend + ret + homeEq + oth;
check('buckets sum to net worth (908,350)', near(nw, 908350), nw);
check('net worth matches the rendered strip', html1.indexOf('$908,350.00') !== -1);
check('November saved matches the bar strip', bars1.indexOf('7,000.00') !== -1);

console.log(failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
