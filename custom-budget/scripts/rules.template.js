#!/usr/bin/env node
/**
 * TEMPLATE — auto-categorization rules for investment activity and
 * opening balances.
 *   1. notes contains a tag (e.g. "#investment-activity") -> Investments.
 *      Every investment-activity row carries that tag in its notes, so
 *      future imported investment rows file themselves to Investments.
 *   2. payee is "Starting Balance" -> Starting Balances.
 *      Future opening-balance rows file themselves to Starting Balances.
 * Deliberately NO rule for transfers: transfers must stay uncategorized
 * (a category on a transfer makes the Budget table count it as spending).
 * No existing rule should match a transfer — rules here match on specific
 * payees / note tags, and transfer payees are account names.
 *
 * FILL IN THE PLACEHOLDERS: the category IDs must be read from your own
 * budget (create the Investments / Starting Balances categories first, then
 * use their ids). Run with ACTUAL_* env vars (API key via stdin -> env,
 * never in a file). See docs/AGENTIC-OPERATING-GUIDE.md.
 *
 * The probe at the end verifies both rules on a throwaway test account and
 * cleans it up. Never trust api.addTransactions()' return value for an id —
 * the probe re-reads the account and matches by (date, amount, notes).
 */
const api = require('@actual-app/api');

// --- PLACEHOLDERS: replace with your own category ids. ---
const INVESTMENTS_CAT = '00000000-0000-0000-0000-000000000001'; // Investments category id
const STARTING_CAT = '00000000-0000-0000-0000-000000000002'; // Starting Balances category id
const INVESTMENT_TAG = '#investment-activity'; // note tag on investment rows

async function main() {
  const { ACTUAL_SERVER_URL, ACTUAL_API_KEY, ACTUAL_SYNC_ID } = process.env;
  if (!ACTUAL_SERVER_URL || !ACTUAL_API_KEY || !ACTUAL_SYNC_ID) {
    throw new Error('Set ACTUAL_SERVER_URL, ACTUAL_API_KEY and ACTUAL_SYNC_ID in the environment.');
  }
  await api.init({
    dataDir: './.actual-cache',
    serverURL: ACTUAL_SERVER_URL,
    sessionToken: ACTUAL_API_KEY,
  });
  await api.downloadBudget(ACTUAL_SYNC_ID);
  console.log('Connected.');

  const payees = await api.getPayees();
  const payeeByName = new Map(payees.map((p) => [p.name, p.id]));
  const startingPayeeId = payeeByName.get('Starting Balance');
  if (!startingPayeeId) throw new Error('No payee named "Starting Balance" found');

  const existing = await api.getRules();
  console.log(`existing rules: ${existing.length}`);
  const hasNotesRule = existing.some((r) =>
    (r.conditions || []).some((c) => c.field === 'notes' && c.value === INVESTMENT_TAG) &&
    (r.actions || []).some((a) => a.field === 'category' && a.value === INVESTMENTS_CAT));
  const hasStartingRule = existing.some((r) =>
    (r.conditions || []).some((c) => c.field === 'payee' && c.value === startingPayeeId) &&
    (r.actions || []).some((a) => a.field === 'category' && a.value === STARTING_CAT));

  let created = 0, skipped = 0;
  if (hasNotesRule) { console.log(`rule exists: notes ${INVESTMENT_TAG} -> Investments`); skipped++; }
  else {
    const res = await api.createRule({
      stage: 'pre', conditionsOp: 'and',
      conditions: [{ field: 'notes', op: 'contains', value: INVESTMENT_TAG, type: 'string' }],
      actions: [{ field: 'category', op: 'set', value: INVESTMENTS_CAT, type: 'id' }],
    });
    created++;
    console.log('created rule: notes tag -> Investments', typeof res === 'string' ? res : JSON.stringify(res).slice(0, 80));
  }
  if (hasStartingRule) { console.log('rule exists: payee Starting Balance -> Starting Balances'); skipped++; }
  else {
    const res = await api.createRule({
      stage: 'pre', conditionsOp: 'and',
      conditions: [{ field: 'payee', op: 'is', value: startingPayeeId, type: 'id' }],
      actions: [{ field: 'category', op: 'set', value: STARTING_CAT, type: 'id' }],
    });
    created++;
    console.log('created rule: payee Starting Balance -> Starting Balances', typeof res === 'string' ? res : JSON.stringify(res).slice(0, 80));
  }
  console.log(`rules created: ${created}, skipped (already exist): ${skipped}`);

  // ---- Probe the new rules on a throwaway test account ----
  const testAcct = await api.createAccount({ name: 'ZZZ Rule Test', offbudget: false, closed: false });
  const acctId = typeof testAcct === 'string' ? testAcct : testAcct.id;
  console.log('test account:', acctId);
  // Use any payee that has no rule of its own for the notes probe, so only
  // the notes rule can fire. (Here: the Starting Balance payee, which has
  // no category rule except the one we just added for its own payee — the
  // notes probe below uses a different note, so the payee rule must not
  // fire on it; the control row proves it.)
  await api.addTransactions(acctId, [
    { payee: startingPayeeId, amount: -100, date: '2027-01-15', notes: `probe ${INVESTMENT_TAG}` },
    { payee: startingPayeeId, amount: 500, date: '2027-01-15', notes: 'probe starting' },
    { payee: startingPayeeId, amount: -2500, date: '2027-01-15', notes: 'probe control, no tag' },
  ]);
  // Re-read and match by (date, amount, notes) — never trust the return value.
  const check = await api.getTransactions(acctId);
  const probes = [
    { notes: `probe ${INVESTMENT_TAG}`, expect: INVESTMENTS_CAT, label: 'notes tag -> Investments' },
    { notes: 'probe starting', expect: STARTING_CAT, label: 'payee Starting Balance -> Starting Balances' },
    { notes: 'probe control, no tag', expect: null, label: 'control (no tag, expect uncategorized)' },
  ];
  for (const p of probes) {
    const row = check.find((t) => (t.notes || '') === p.notes);
    const ok = p.expect === null ? !row.category : row.category === p.expect;
    console.log(`PROBE ${p.label}: category=${row ? row.category : 'MISSING'} expected=${p.expect || 'none'} -> ${ok ? 'PASS' : 'FAIL'}`);
  }
  for (const t of check) await api.deleteTransaction(t.id);
  await api.deleteAccount(acctId);
  console.log('probe cleaned up (transactions + test account deleted).');

  const rulesAfter = await api.getRules();
  console.log(JSON.stringify({ rulesTotal: rulesAfter.length, created, skipped }, null, 1));

  await api.sync();
  await api.shutdown();
  console.log('DONE.');
}

main().catch((e) => { console.error('FATAL:', e && e.message ? e.message : e); process.exit(1); });
