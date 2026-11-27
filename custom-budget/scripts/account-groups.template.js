#!/usr/bin/env node
/**
 * TEMPLATE — account groups for the three-way split.
 * Actual has a supported account-groups feature (sidebar): create groups
 * (e.g. Retirement / Brokerage / Liquid cash) and assign accounts to them,
 * so the split shows in Actual's own sidebar. Groups only change how
 * accounts are listed; they do not affect the budget, balances or reports.
 *
 * FILL IN THE PLACEHOLDERS below with your own group names and account
 * names (the `needle` is matched as a substring of the account name).
 * Run with ACTUAL_* env vars (API key via stdin -> env, never in a file).
 * See docs/AGENTIC-OPERATING-GUIDE.md.
 */
const api = require('@actual-app/api');

// --- PLACEHOLDERS: replace with your own groups and accounts. ---
const GROUPS = {
  Retirement: ['Retirement Account A', 'Retirement Account B'],
  Brokerage: ['Brokerage Account A', 'Brokerage Account B', 'Brokerage Account C'],
  'Liquid cash': ['Cash Account A', 'Cash Account B', 'Cash Account C', 'Cash Account D', 'Cash on hand'],
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

  const existingGroups = await api.getAccountGroups();
  console.log('existing groups:', JSON.stringify(existingGroups));
  const groupIds = {};
  for (const name of Object.keys(GROUPS)) {
    const found = existingGroups.find((g) => g.name === name);
    if (found) {
      groupIds[name] = found.id;
      console.log(`group "${name}" already exists (${found.id}), reusing`);
    } else {
      const id = await api.createAccountGroup({ name });
      groupIds[name] = id;
      console.log(`created group "${name}" (${id})`);
    }
  }

  const accounts = await api.getAccounts();
  const assignments = [];
  for (const [groupName, needles] of Object.entries(GROUPS)) {
    for (const needle of needles) {
      const acct = accounts.find((a) => a.name.includes(needle));
      if (!acct) throw new Error(`ABORT: no account matching "${needle}"`);
      assignments.push({ groupName, needle, id: acct.id, name: acct.name });
    }
  }
  console.log('assignments:', JSON.stringify(assignments, null, 1));

  for (const a of assignments) {
    await api.updateAccount(a.id, { account_group_id: groupIds[a.groupName] });
  }
  console.log('assigned all accounts to groups');

  await api.sync();
  console.log('synced. Verifying by re-reading...');

  const afterAccounts = await api.getAccounts();
  const afterGroups = await api.getAccountGroups();
  const byId = new Map(afterAccounts.map((a) => [a.id, a]));
  for (const a of assignments) {
    const cur = byId.get(a.id);
    if (!cur || cur.account_group_id !== groupIds[a.groupName]) {
      throw new Error(`VERIFY FAILED: ${a.name} group is ${cur && cur.account_group_id}, expected ${groupIds[a.groupName]}`);
    }
  }
  for (const [groupName, needles] of Object.entries(GROUPS)) {
    const total = assignments
      .filter((a) => a.groupName === groupName)
      .reduce((s, a) => {
        const cur = byId.get(a.id);
        return s + (cur.balance_current ?? 0);
      }, 0);
    console.log(`group "${groupName}": total balance_current = ${total / 100}`);
  }
  console.log('groups now:', JSON.stringify(afterGroups));
  console.log('verified: all accounts in their groups');

  await api.shutdown();
  console.log('DONE.');
}

main().catch((e) => { console.error('FATAL:', e && e.message ? e.message : e); process.exit(1); });
