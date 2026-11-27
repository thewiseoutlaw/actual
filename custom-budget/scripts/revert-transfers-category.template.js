#!/usr/bin/env node
/**
 * TEMPLATE — revert a category that was wrongly assigned to transfers.
 * Giving a transfer transaction a category makes Actual's Budget table count
 * it as spending, which inflates the table's Spent/Balance totals (the API's
 * totalSpent does not change, so a one-row test misleadingly passes — the
 * pollution shows in the UI table, not in the API). Transfers must stay
 * uncategorized. This sets the category back to null on every transaction
 * carrying the given category id, then verifies the result.
 *
 * FILL IN THE PLACEHOLDERS: the category id to clear, and the expected
 * November (or current-month) totals for your own budget. Run with
 * ACTUAL_* env vars (API key via stdin -> env, never in a file).
 * See docs/AGENTIC-OPERATING-GUIDE.md.
 */
const api = require('@actual-app/api');

// --- PLACEHOLDERS: replace with your own values. ---
const CATEGORY_TO_CLEAR = '00000000-0000-0000-0000-000000000003'; // category id to clear
const EXPECTED = {
  totalSpentCents: -500000, // expected current-month totalSpent, cents (placeholder)
  totalBudgetedCents: 750000, // expected current-month totalBudgeted, cents (placeholder)
};

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

  const accounts = await api.getAccounts();
  const affected = [];
  for (const acct of accounts) {
    const txns = await api.getTransactions(acct.id, '2027-01-01', '2027-12-31');
    for (const t of txns) {
      if (t.category === CATEGORY_TO_CLEAR) {
        affected.push({ id: t.id, date: t.date, account: acct.name, amount: t.amount / 100, transfer_id: !!t.transfer_id });
      }
    }
  }
  console.log(`rows carrying the category: ${affected.length}`);

  let reverted = 0;
  for (const r of affected) {
    await api.updateTransaction(r.id, { category: null });
    reverted++;
  }
  console.log(`REVERTED: ${reverted} rows set back to uncategorized`);

  let still = 0, uncategorizedAfter = 0;
  for (const acct of accounts) {
    const txns = await api.getTransactions(acct.id, '2027-01-01', '2027-12-31');
    for (const t of txns) {
      if (t.category === CATEGORY_TO_CLEAR) still++;
      if (!t.category) uncategorizedAfter++;
    }
  }
  const month = await api.getBudgetMonth('2027-11');
  console.log(JSON.stringify({
    stillCarryingCategory: still,
    uncategorizedAfter,
    month: { totalSpent: month.totalSpent, totalBudgeted: month.totalBudgeted },
    expected: EXPECTED,
  }, null, 1));

  await api.sync();
  await api.shutdown();
  console.log('DONE.');
}

main().catch((e) => { console.error('FATAL:', e && e.message ? e.message : e); process.exit(1); });
