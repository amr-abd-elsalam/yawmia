#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-repository-contracts.js — Phase 61 Repository Contracts
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const STRICT = process.argv.includes('--strict');

function printHelp() {
  console.log(`
Usage:
  node scripts/verify-repository-contracts.js
  node scripts/verify-repository-contracts.js --json
  node scripts/verify-repository-contracts.js --json --strict

Verifies:
  - repository contract matrix exists
  - runtime switch disabled
  - file-backed source of truth preserved
  - no external adapter by default
  - docs exist
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printHelp();
  process.exit(0);
}

try {
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  if (JSON_OUT) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }

  const { getRepositoryContractReadiness } = await import('../server/services/repositoryContractReport.js');
  const report = await getRepositoryContractReadiness();

  const ok = report.blockers.length === 0 && (!STRICT || report.warnings.length === 0);

  const output = {
    ok,
    status: ok ? (report.warnings.length > 0 ? 'warning' : 'passed') : 'failed',
    report,
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log('\n📦 Repository Contract Readiness\n');
    console.log(`Status: ${output.status}`);
    console.log(`Runtime switch: ${report.runtimeSwitchEnabled ? 'enabled' : 'disabled'}`);
    console.log(`File-backed source of truth: ${report.fileBackedSourceOfTruth ? 'yes' : 'no'}`);
    console.log(`External adapter implemented: ${report.externalAdapterImplemented ? 'yes' : 'no'}`);
    console.log(`Contracts: ${(report.matrix || []).length}`);
    console.log(`Warnings: ${report.warnings.length}`);
    console.log(`Blockers: ${report.blockers.length}`);
    console.log('');
  }

  process.exit(ok ? 0 : 1);
} catch (err) {
  const out = {
    ok: false,
    status: 'failed',
    error: err.message,
    generatedAt: new Date().toISOString(),
  };
  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  else console.error(err);
  process.exit(1);
}
