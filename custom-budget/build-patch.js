#!/usr/bin/env node
/**
 * build-patch.js — build actual-budget-tweaks.js from
 * actual-budget-tweaks.js.template + a YAML config.
 *
 *   node build-patch.js [config.yml]
 *     Build the patch. Default config is config.yml if it exists, else
 *     config.example.yml (the demo). Writes actual-budget-tweaks.js
 *     next to this script. Refuses to build if the config does not
 *     reconcile (see validate()).
 *
 *   node build-patch.js --check [config.yml]
 *     Validate the config only (no file written).
 *
 *   node build-patch.js --print <config.yml> <dotted.path>
 *     Print one config value (e.g. install.build_dir). Used by
 *     install-tweaks.sh so the install settings can live in the config.
 *
 * Plain Node, no dependencies, no YAML library: the parser below handles
 * exactly the constructs config.example.yml uses (nested maps, lists of
 * maps, flow lists, quoted/unquoted scalars, comments). It is not a
 * general YAML parser — keep the config in that shape.
 *
 * The generated actual-budget-tweaks.js is a build artifact: it is
 * gitignored and never committed. The template + config are the source
 * of truth. See README.md and .gitignore.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const TEMPLATE = path.join(DIR, 'actual-budget-tweaks.js.template');
const OUTPUT = path.join(DIR, 'actual-budget-tweaks.js');

/* ------------------------------------------------------------------ */
/* Tiny YAML parser (subset)                                           */
/* ------------------------------------------------------------------ */

function stripComment(line) {
  // Remove a trailing "# comment" — only outside quotes.
  let inS = false;
  let inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (
      c === '#' && !inS && !inD &&
      (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')
    ) {
      return line.slice(0, i).replace(/[ \t]+$/, '');
    }
  }
  return line;
}

function splitFlow(inner) {
  // Split a "[a, b, c]" list on commas outside quotes.
  const out = [];
  let cur = '';
  let inS = false;
  let inD = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    if (c === ',' && !inS && !inD) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseScalar(s) {
  s = s.trim();
  if (s === '') return null;
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s[0] === '[' && s[s.length - 1] === ']') {
    const inner = s.slice(1, -1).trim();
    if (inner === '') return [];
    return splitFlow(inner).map((x) => parseScalar(x));
  }
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

function parseYAML(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*\t/.test(raw) || /^ +\t/.test(raw)) {
      throw new Error('tabs are not allowed for indentation: ' + JSON.stringify(raw));
    }
    const noComment = stripComment(raw);
    if (noComment.trim() === '') continue;
    const indent = noComment.match(/^ */)[0].length;
    lines.push({ indent, content: noComment.slice(indent) });
  }
  if (lines.length === 0) return {};
  const [value, next] = parseBlock(lines, 0, lines[0].indent);
  if (next !== lines.length) {
    throw new Error('unexpected content at: ' + lines[next].content);
  }
  return value;
}

function parseBlock(lines, i, indent) {
  if (i >= lines.length) return [null, i];
  const first = lines[i];
  if (first.indent !== indent) {
    throw new Error('unexpected indent ' + first.indent + ' (expected ' + indent + ') at: ' + first.content);
  }
  if (first.content === '-' || first.content.startsWith('- ')) {
    return parseList(lines, i, indent);
  }
  return parseMap(lines, i, indent);
}

function parseMap(lines, i, indent) {
  const obj = {};
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent !== indent) break;
    if (line.content === '-' || line.content.startsWith('- ')) break;
    const m = /^([^:\s][^:]*):(?:\s+(.*))?$/.exec(line.content);
    if (!m) throw new Error('expected "key: value" at: ' + line.content);
    const key = m[1].trim();
    const val = (m[2] || '').trim();
    i++;
    if (val === '') {
      if (i < lines.length && lines[i].indent > indent) {
        const [v, ni] = parseBlock(lines, i, lines[i].indent);
        obj[key] = v;
        i = ni;
      } else {
        obj[key] = null;
      }
    } else {
      obj[key] = parseScalar(val);
    }
  }
  return [obj, i];
}

function parseList(lines, i, indent) {
  const arr = [];
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent !== indent) break;
    if (!(line.content === '-' || line.content.startsWith('- '))) break;
    const after = line.content === '-' ? '' : line.content.slice(2);
    if (after.trim() === '') {
      i++;
      if (i < lines.length && lines[i].indent > indent) {
        const [v, ni] = parseBlock(lines, i, lines[i].indent);
        arr.push(v);
        i = ni;
      } else {
        arr.push(null);
      }
    } else if (/^[^:\s][^:]*:/.test(after.trim())) {
      // A map starting on the dash line; its keys live at indent + 2.
      const itemIndent = indent + 2;
      const mapLines = [{ indent: itemIndent, content: after.trim() }];
      let j = i + 1;
      while (
        j < lines.length &&
        lines[j].indent === itemIndent &&
        !lines[j].content.startsWith('- ')
      ) {
        mapLines.push(lines[j]);
        j++;
      }
      const [v] = parseMap(mapLines, 0, itemIndent);
      arr.push(v);
      i = j;
    } else {
      arr.push(parseScalar(after.trim()));
      i++;
    }
  }
  return [arr, i];
}

/* ------------------------------------------------------------------ */
/* Validation + token generation                                       */
/* ------------------------------------------------------------------ */

function fail(msg) {
  throw new Error('config error: ' + msg);
}

function near(a, b) {
  return Math.abs(a - b) < 0.005;
}

function reqNum(obj, key, where) {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    fail(where + '.' + key + ' must be a number, got ' + JSON.stringify(v));
  }
  return v;
}

function reqStr(obj, key, where) {
  const v = obj[key];
  if (typeof v !== 'string' || v === '') {
    fail(where + '.' + key + ' must be a non-empty string, got ' + JSON.stringify(v));
  }
  return v;
}

// Config key -> the JS key used in the patch's FALLBACK / accountKey().
const JS_KEY = {
  retirement_a: 'retirementA',
  retirement_b: 'retirementB',
  brokerage_a: 'brokerageA',
  brokerage_b: 'brokerageB',
  brokerage_c: 'brokerageC',
  cash_a: 'cashA',
  cash_b: 'cashB',
  cash_c: 'cashC',
  cash_d: 'cashD',
  cash_on_hand: 'cashOnHand',
  card_a: 'cardA',
  card_b: 'cardB',
  card_c: 'cardC',
  card_d: 'cardD',
  card_e: 'cardE',
  card_f: 'cardF',
  card_g: 'cardG',
  card_h: 'cardH',
  mortgage: 'mortgage',
  house_down_payment: 'houseDown',
  other_a: 'otherA',
  other_b: 'otherB',
  other_c: 'otherC',
  other_d: 'otherD',
  other_e: 'otherE',
};
const MATCHER_ORDER = Object.keys(JS_KEY);

const MONTH_ABBR = {
  Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April',
  May: 'May', Jun: 'June', Jul: 'July', Aug: 'August',
  Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
};

function jsNum(v) {
  // JS number literal; integers keep the ".0" style of the original patch.
  return Number.isInteger(v) ? v + '.0' : String(v);
}

function fmtInt(v) {
  return Math.round(v).toLocaleString('en-US');
}

function fmtMoney(v) {
  // "+$7,000.00" / "−$7,000.00" (U+2212 minus, as the patch uses).
  const sign = v >= 0 ? '+' : '−';
  return sign + '$' + Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function escJS(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function validate(cfg) {
  if (!cfg || typeof cfg !== 'object') fail('config is empty or not a mapping');

  // --- install ---
  if (!cfg.install || typeof cfg.install !== 'object') fail('install: section is required');
  reqStr(cfg.install, 'build_dir', 'install');
  reqStr(cfg.install, 'server_url', 'install');

  // --- home ---
  if (!cfg.home || typeof cfg.home !== 'object') fail('home: section is required');
  const homeValue = reqNum(cfg.home, 'value', 'home');
  const mortgageOwed = reqNum(cfg.home, 'mortgage_owed', 'home');
  const downPayment = reqNum(cfg.home, 'down_payment', 'home');
  const may1Liquid = reqNum(cfg.home, 'may1_liquid', 'home');

  // --- net worth ---
  const netWorth = reqNum(cfg, 'net_worth', 'config');

  // --- accounts ---
  if (!cfg.accounts || typeof cfg.accounts !== 'object') fail('accounts: section is required');
  const acct = {};
  for (const k of ['retirement_a', 'retirement_b', 'brokerage_a', 'brokerage_b',
    'brokerage_c', 'cash_a', 'cash_b', 'cash_c', 'cash_d', 'cash_on_hand',
    'cards_owed', 'other_a', 'other_b', 'other_c', 'other_d', 'other_e']) {
    acct[k] = reqNum(cfg.accounts, k, 'accounts');
  }

  // --- account_names ---
  if (!cfg.account_names || typeof cfg.account_names !== 'object') {
    fail('account_names: section is required');
  }
  for (const k of MATCHER_ORDER) {
    reqStr(cfg.account_names, k, 'account_names');
  }
  for (const k of Object.keys(cfg.account_names)) {
    if (!JS_KEY[k]) fail('account_names.' + k + ' is not a known account key');
  }

  // --- current month ---
  if (!cfg.current_month || typeof cfg.current_month !== 'object') {
    fail('current_month: section is required');
  }
  const cmName = reqStr(cfg.current_month, 'name', 'current_month');
  const cmSpent = reqNum(cfg.current_month, 'spent', 'current_month');
  const cmBudget = reqNum(cfg.current_month, 'budget', 'current_month');

  // --- months ---
  if (!Array.isArray(cfg.months) || cfg.months.length === 0) {
    fail('months: must be a non-empty list');
  }
  const monthByShort = {};
  for (const m of cfg.months) {
    if (!m || typeof m !== 'object') fail('each month must be a mapping');
    reqStr(m, 'name', 'months[]');
    const income = reqNum(m, 'income', 'months.' + m.name);
    const spending = reqNum(m, 'spending', 'months.' + m.name);
    const saved = reqNum(m, 'saved', 'months.' + m.name);
    if (!near(income - spending, saved)) {
      fail('months.' + m.name + ': income - spending (' + (income - spending) +
        ') != saved (' + saved + ')');
    }
    if (monthByShort[m.name]) fail('duplicate month: ' + m.name);
    monthByShort[m.name] = m;
  }

  // --- goals ---
  if (!cfg.goals || typeof cfg.goals !== 'object') fail('goals: section is required');
  const qTarget = reqNum(cfg.goals, 'quarterly_target', 'goals');
  const aTarget = reqNum(cfg.goals, 'annual_target', 'goals');
  const yearToDate = reqNum(cfg.goals, 'year_to_date', 'goals');
  if (!Array.isArray(cfg.goals.quarters) || cfg.goals.quarters.length === 0) {
    fail('goals.quarters: must be a non-empty list');
  }
  for (const q of cfg.goals.quarters) {
    if (!q || typeof q !== 'object') fail('each quarter must be a mapping');
    reqStr(q, 'label', 'goals.quarters[]');
    const qSaved = reqNum(q, 'saved', 'goals.quarters.' + q.label);
    if (!Array.isArray(q.months) || q.months.length === 0) {
      fail('goals.quarters.' + q.label + '.months: must be a non-empty list');
    }
    let sum = 0;
    for (const mn of q.months) {
      const mm = monthByShort[mn];
      if (!mm) fail('goals.quarters.' + q.label + ': unknown month ' + JSON.stringify(mn));
      sum += mm.saved;
    }
    if (!near(sum, qSaved)) {
      fail('goals.quarters.' + q.label + ': saved (' + qSaved +
        ') != sum of its months (' + sum + ')');
    }
  }
  const totalSaved = cfg.months.reduce((a, m) => a + m.saved, 0);
  if (!near(totalSaved, yearToDate)) {
    fail('goals.year_to_date (' + yearToDate + ') != sum of months\' saved (' + totalSaved + ')');
  }

  // --- current month must be one of the months, and its spent must match ---
  const cmShort = Object.keys(MONTH_ABBR).find((k) => MONTH_ABBR[k] === cmName);
  if (!cmShort) fail('current_month.name is not a full month name: ' + JSON.stringify(cmName));
  const cmMonth = monthByShort[cmShort];
  if (!cmMonth) fail('current_month.name ' + cmName + ' is not in the months list');
  if (!near(cmMonth.spending, cmSpent)) {
    fail('current_month.spent (' + cmSpent + ') != spending of ' + cmName +
      ' (' + cmMonth.spending + ')');
  }
  const cmSaved = cmMonth.income - cmMonth.spending;

  // --- net worth must equal the buckets ---
  const retirement = acct.retirement_a + acct.retirement_b;
  const brokerage = acct.brokerage_a + acct.brokerage_b + acct.brokerage_c;
  const bankCash = acct.cash_a + acct.cash_b + acct.cash_c + acct.cash_d;
  const netSpendable = bankCash + acct.cash_on_hand - acct.cards_owed;
  const homeEquity = homeValue - mortgageOwed;
  const other = acct.other_a + acct.other_b + acct.other_c + acct.other_d + acct.other_e;
  const computed = retirement + brokerage + netSpendable + homeEquity + other;
  if (!near(computed, netWorth)) {
    fail('net_worth (' + netWorth + ') != buckets sum (' + computed + ')' +
      ' [retirement ' + retirement + ' + brokerage ' + brokerage +
      ' + net spendable ' + netSpendable + ' + home equity ' + homeEquity +
      ' + other ' + other + ']');
  }

  // --- tokens ---
  const tokens = {
    RETIREMENT_A: jsNum(acct.retirement_a),
    RETIREMENT_B: jsNum(acct.retirement_b),
    BROKERAGE_A: jsNum(acct.brokerage_a),
    BROKERAGE_B: jsNum(acct.brokerage_b),
    BROKERAGE_C: jsNum(acct.brokerage_c),
    CASH_A: jsNum(acct.cash_a),
    CASH_B: jsNum(acct.cash_b),
    CASH_C: jsNum(acct.cash_c),
    CASH_D: jsNum(acct.cash_d),
    CASH_ON_HAND: jsNum(acct.cash_on_hand),
    CARDS_OWED: jsNum(acct.cards_owed),
    MORTGAGE_OWED: jsNum(mortgageOwed),
    DOWN_PAYMENT: jsNum(downPayment),
    HOME_VALUE: jsNum(homeValue),
    MAY1_LIQUID: jsNum(may1Liquid),
    OTHER_A: jsNum(acct.other_a),
    OTHER_B: jsNum(acct.other_b),
    OTHER_C: jsNum(acct.other_c),
    OTHER_D: jsNum(acct.other_d),
    OTHER_E: jsNum(acct.other_e),
    CURRENT_MONTH_NAME: cmName,
    CURRENT_SPENT: jsNum(cmSpent),
    CURRENT_BUDGET: jsNum(cmBudget),
    QUARTERLY_TARGET: jsNum(qTarget),
    ANNUAL_TARGET: jsNum(aTarget),
    YEAR_TO_DATE: jsNum(yearToDate),
    QUARTERLY_TARGET_FMT: fmtInt(qTarget),
    ANNUAL_TARGET_FMT: fmtInt(aTarget),
    CURRENT_BUDGET_FMT: fmtInt(cmBudget),
    QUARTERLY_TARGET_K: String(qTarget / 1000),
    HOME_VALUE_FMT: fmtInt(homeValue),
    CURRENT_MONTH_SAVED_FMT: fmtMoney(cmSaved),
    YEAR_LABEL: cfg.months[0].name + '&ndash;' + cfg.months[cfg.months.length - 1].name,
    MONTHLY_ROWS: cfg.months.map((m) =>
      "      { m: '" + escJS(m.name) + "', income: " + jsNum(m.income) +
      ', spending: ' + jsNum(m.spending) + ', saved: ' + jsNum(m.saved) + ' },'
    ).join('\n') + '\n',
    QUARTER_ROWS: cfg.goals.quarters.map((q) =>
      "      { label: '" + escJS(q.label) + "', saved: " + jsNum(q.saved) + ' },'
    ).join('\n') + '\n',
    ACCOUNT_MATCHERS: MATCHER_ORDER.map((k) =>
      "    if (n.indexOf('" + escJS(cfg.account_names[k]) + "') !== -1) return '" + JS_KEY[k] + "';"
    ).join('\n'),
  };
  return tokens;
}

function loadConfig(cfgPath) {
  let text;
  try {
    text = fs.readFileSync(cfgPath, 'utf8');
  } catch (e) {
    throw new Error('cannot read config ' + cfgPath + ' (' + (e.code || e.message) + ')');
  }
  return parseYAML(text);
}

function getPath(obj, dotted) {
  let cur = obj;
  for (const part of dotted.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--print') {
    const cfg = loadConfig(args[1]);
    const val = getPath(cfg, args[2]);
    if (val === undefined) {
      console.error('no such value: ' + args[2]);
      process.exit(1);
    }
    console.log(String(val));
    return;
  }

  if (args[0] === '--check') {
    const cfgPath = args[1] || path.join(DIR, 'config.yml');
    const cfg = loadConfig(cfgPath);
    validate(cfg);
    console.log('config OK: ' + cfgPath);
    return;
  }

  const cfgPath = args[0] ||
    (fs.existsSync(path.join(DIR, 'config.yml'))
      ? path.join(DIR, 'config.yml')
      : path.join(DIR, 'config.example.yml'));
  const cfg = loadConfig(cfgPath);
  const tokens = validate(cfg);

  let template;
  try {
    template = fs.readFileSync(TEMPLATE, 'utf8');
  } catch (e) {
    console.error('cannot read template ' + TEMPLATE + ' (' + (e.code || e.message) + ')');
    process.exit(1);
  }
  let out = template;
  for (const [k, v] of Object.entries(tokens)) {
    out = out.split('{{' + k + '}}').join(v);
  }
  const leftover = out.match(/\{\{[A-Z0-9_]+\}\}/g);
  if (leftover) {
    console.error('unresolved tokens: ' + [...new Set(leftover)].join(', '));
    process.exit(1);
  }
  fs.writeFileSync(OUTPUT, out);
  console.log('built ' + OUTPUT + ' from ' + cfgPath);
}

main();
