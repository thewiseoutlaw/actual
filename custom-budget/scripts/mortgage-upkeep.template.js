#!/usr/bin/env node
/**
 * TEMPLATE — mortgage balance upkeep.
 * The mortgage account in Actual only holds the recorded payments, because
 * there is no bank connector for the mortgage servicer. This sets the
 * account to the loan owed (the principal per the servicer's portal) by
 * adding one clearly-noted adjustment transaction; the payment transactions
 * are left untouched. The mortgage account is off-budget, so the adjustment
 * stays uncategorized and does not touch the budget.
 *
 * FILL IN THE PLACEHOLDERS below (account name, target principal in cents,
 * servicer name). Get the principal from the servicer's portal on the day
 * you run it, and only apply the adjustment when no payment has posted
 * since that portal read. Run with ACTUAL_* env vars (API key via stdin
 * -> env, never in a file). See docs/AGENTIC-OPERATING-GUIDE.md.
 *
 * Keeping it up to date: the principal only changes when a payment posts.
 * Monthly, interest = principal * rate / 12 and the principal portion =
 * monthly P&I - interest. If payments are biweekly, interest =
 * principal * rate / 26 and the principal portion = biweekly P&I - interest.
 * A scheduled job has no API key, so it can only compute the expected
 * principal and tell you — the adjustment itself is applied when you are
 * in chat with a fresh key.
 */
const api = require('@actual-app/api');

// --- PLACEHOLDERS: replace with your own values. ---
const MORTGAGE_ACCOUNT_NAME = 'Mortgage'; // exact account name in Actual
const TARGET_PRINCIPAL_CENTS = 85000000; // e.g. $850,000.00 owed (placeholder)
const SERVICER_NAME = 'Mortgage Servicer'; // placeholder servicer name
const AS_OF_DATE = '2027-01-01'; // date of the portal read (placeholder)

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
  const acct = accounts.find((a) => a.name === MORTGAGE_ACCOUNT_NAME);
  if (!acct) throw new Error(`ABORT: account "${MORTGAGE_ACCOUNT_NAME}" not found`);
  const txns = await api.getTransactions(acct.id, '2027-01-01', '2027-12-31');
  const balance = txns.reduce((s, t) => s + t.amount, 0);
  console.log(`Mortgage account: balance=${balance / 100} txns=${txns.length}`);

  const adjustment = -TARGET_PRINCIPAL_CENTS - balance;
  console.log(`adjustment to apply: ${adjustment / 100} (target balance ${-TARGET_PRINCIPAL_CENTS / 100})`);

  await api.addTransactions(acct.id, [{
    date: AS_OF_DATE,
    amount: adjustment,
    payee_name: SERVICER_NAME,
    notes: `Balance true-up — principal owed per ${SERVICER_NAME} portal ${AS_OF_DATE}. The recorded payments are full monthly payments (P&I + escrow), so the balance is set to the principal owed; a monthly true-up keeps it at the true principal as payments post.`,
    cleared: true,
  }]);
  console.log('added adjustment txn (id resolved by re-read, not by return value)');

  await api.sync();
  console.log('synced. Verifying by re-reading...');

  const after = await api.getTransactions(acct.id, '2027-01-01', '2027-12-31');
  const newBalance = after.reduce((s, t) => s + t.amount, 0);
  if (newBalance !== -TARGET_PRINCIPAL_CENTS) {
    throw new Error(`VERIFY FAILED: balance ${newBalance / 100}, expected ${-TARGET_PRINCIPAL_CENTS / 100}`);
  }
  const adj = after.filter((t) => t.date === AS_OF_DATE && t.amount === adjustment);
  if (adj.length !== 1) throw new Error(`VERIFY FAILED: adjustment txn matched ${adj.length}, expected 1`);
  console.log(`verified: Mortgage balance now ${newBalance / 100} (principal owed), txns=${after.length}`);

  await api.shutdown();
  console.log('DONE.');
}

main().catch((e) => { console.error('FATAL:', e && e.message ? e.message : e); process.exit(1); });
