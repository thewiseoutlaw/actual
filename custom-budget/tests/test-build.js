#!/usr/bin/env node
/**
 * Test the build step (build-patch.js) for the custom-budget patch.
 * Plain Node, no extra dependencies. All fixtures use the demo
 * config.example.yml (placeholder figures) and small mutations of it.
 *
 * Covers: a valid config builds and the output is valid JS with no
 * unresolved tokens; a config whose figures do NOT reconcile is rejected
 * (a month's saved, a quarter's saved, the year-to-date figure, the net
 * worth, and the current month's spent); a missing required value is
 * rejected; --check and --print work. A bad config must never overwrite
 * the previously built patch (validation runs before the write).
 *
 * Usage: node tests/test-build.js   (or: ./tests/run-tests.sh)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR = __dirname;
const BUILD = path.join(DIR, '..', 'build-patch.js');
const EXAMPLE = path.join(DIR, '..', 'config.example.yml');
const OUTPUT = path.join(DIR, '..', 'actual-budget-tweaks.js');

let failures = 0;
function check(name, cond, extra) {
  if (cond) {
    console.log('  ok - ' + name);
  } else {
    failures++;
    console.log('  FAIL - ' + name + (extra !== undefined ? ' :: ' + extra : ''));
  }
}

function runBuild(args) {
  return spawnSync(process.execPath, [BUILD].concat(args), { encoding: 'utf8' });
}

const exampleText = fs.readFileSync(EXAMPLE, 'utf8');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-patch-test-'));
function badConfig(name, mutate) {
  const p = path.join(tmpDir, name + '.yml');
  fs.writeFileSync(p, mutate(exampleText));
  return p;
}

// ================= Valid config builds =================
console.log('Build step: valid config');
const outBefore = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : null;
const good = runBuild([EXAMPLE]);
check('build from config.example.yml exits 0', good.status === 0, (good.stderr || '').trim());
check('generated patch exists', fs.existsSync(OUTPUT));
const generated = fs.readFileSync(OUTPUT, 'utf8');
check('generated patch has no unresolved tokens', !/\{\{[A-Z0-9_]+\}\}/.test(generated));
check('generated patch has the demo figures', generated.indexOf('180000.0') !== -1 && generated.indexOf('908350') === -1, 'spot check');
check('generated patch is valid JS', runBuild(['--check', EXAMPLE]).status === 0);
const checkJs = spawnSync(process.execPath, ['--check', OUTPUT], { encoding: 'utf8' });
check('node --check passes on the generated patch', checkJs.status === 0, (checkJs.stderr || '').trim());

// --check and --print
console.log('Build step: --check and --print');
const chk = runBuild(['--check', EXAMPLE]);
check('--check exits 0 on the good config', chk.status === 0, (chk.stderr || '').trim());
const pr = runBuild(['--print', EXAMPLE, 'install.build_dir']);
check('--print install.build_dir', pr.status === 0 && pr.stdout.trim() === '/path/to/actual-app/web/build', pr.stdout.trim());
const pr2 = runBuild(['--print', EXAMPLE, 'install.server_url']);
check('--print install.server_url', pr2.status === 0 && pr2.stdout.trim() === 'https://example.com:5006', pr2.stdout.trim());
const prBad = runBuild(['--print', EXAMPLE, 'install.nope']);
check('--print unknown path exits non-zero', prBad.status !== 0);

// ================= Reconciliation failures =================
console.log('Build step: a config that does not reconcile is rejected');

// 1. A month's saved does not equal income - spending.
const badMonth = badConfig('bad-month', (t) =>
  t.replace('    saved: -16000', '    saved: -16001'));
const r1 = runBuild([badMonth]);
check('month saved != income - spending is rejected', r1.status !== 0, 'exit ' + r1.status);
check('month error names the month', /May/.test(r1.stderr || ''), (r1.stderr || '').trim());

// 2. A quarter's saved does not match its months.
const badQuarter = badConfig('bad-quarter', (t) =>
  t.replace('      saved: -12000', '      saved: -12001'));
const r2 = runBuild([badQuarter]);
check('quarter saved != sum of its months is rejected', r2.status !== 0, 'exit ' + r2.status);
check('quarter error names the quarter', /Q2/.test(r2.stderr || ''), (r2.stderr || '').trim());

// 3. The year-to-date figure does not match the months.
const badYtd = badConfig('bad-ytd', (t) =>
  t.replace('  year_to_date: -9000', '  year_to_date: -9001'));
const r3 = runBuild([badYtd]);
check('year_to_date != sum of months is rejected', r3.status !== 0, 'exit ' + r3.status);

// 4. The net worth does not match the buckets.
const badNw = badConfig('bad-networth', (t) =>
  t.replace('net_worth: 908350', 'net_worth: 908351'));
const r4 = runBuild([badNw]);
check('net_worth != buckets sum is rejected', r4.status !== 0, 'exit ' + r4.status);
check('net worth error shows the computed sum', /908350/.test(r4.stderr || ''), (r4.stderr || '').trim());

// 5. The current month's spent does not match that month's spending.
const badCm = badConfig('bad-current-month', (t) =>
  t.replace('  spent: 5000', '  spent: 5001'));
const r5 = runBuild([badCm]);
check('current_month.spent != month spending is rejected', r5.status !== 0, 'exit ' + r5.status);

// 6. A required value is missing.
const missing = badConfig('missing-value', (t) =>
  t.split('\n').filter((l) => !l.trim().startsWith('value: 1200000')).join('\n'));
const r6 = runBuild([missing]);
check('missing home.value is rejected', r6.status !== 0, 'exit ' + r6.status);
check('missing-value error names the key', /home\.value/.test(r6.stderr || ''), (r6.stderr || '').trim());

// 7. An unknown account-name key is rejected.
const badKey = badConfig('bad-key', (t) =>
  t.replace('  retirement_a: "retirement account a"',
    '  retirement_a: "retirement account a"\n  retirement_z: "retirement account z"'));
const r7 = runBuild([badKey]);
check('unknown account_names key is rejected', r7.status !== 0, 'exit ' + r7.status);

// A rejected build must not overwrite the previously built patch.
const outAfter = fs.readFileSync(OUTPUT, 'utf8');
check('rejected builds leave the built patch untouched', outAfter === generated && generated === outBefore, 'patch changed after a rejected build');

// Clean up temp configs.
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(failures === 0 ? 'ALL BUILD TESTS PASSED' : failures + ' BUILD TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
