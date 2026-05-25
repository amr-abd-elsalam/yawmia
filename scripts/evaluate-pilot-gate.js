#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/evaluate-pilot-gate.js — Phase 61 Pilot Gate
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--persist') args.persist = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--candidate=')) args.candidate = arg.slice('--candidate='.length);
    else if (arg.startsWith('--approval=')) args.approvalId = arg.slice('--approval='.length);
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/evaluate-pilot-gate.js
  node scripts/evaluate-pilot-gate.js --json
  node scripts/evaluate-pilot-gate.js --candidate=ops_queue --json
  node scripts/evaluate-pilot-gate.js --candidate=ops_queue --approval=apr_x --persist --json

Default:
  pilotAllowed=false unless all blockers are cleared.
  implementationAllowed=false always in Phase 61 unless explicitly changed in a future approved phase.
`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

try {
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  if (args.json) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const service = await import('../server/services/pilotDecisionGate.js');

  const result = args.persist
    ? await service.capturePilotDecisionSnapshot({ candidate: args.candidate, approvalId: args.approvalId })
    : { ok: true, gate: await service.getPilotDecisionGate({ candidate: args.candidate, approvalId: args.approvalId }) };

  if (args.json) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(result, null, 2));
  } else {
    const gate = result.gate || {};
    console.log('\n🚦 Phase 61 Pilot Gate\n');
    console.log(`Candidate: ${gate.candidate || '-'}`);
    console.log(`Pilot allowed: ${gate.pilotAllowed ? 'yes' : 'no'}`);
    console.log(`Implementation allowed: ${gate.implementationAllowed ? 'yes' : 'no'}`);
    console.log(`Blockers: ${(gate.blockers || []).length}`);
    for (const b of gate.blockers || []) {
      console.log(`- ${b.code}: ${b.message}`);
    }
    console.log('');
  }

  process.exit(result.gate && result.gate.pilotAllowed ? 0 : 1);
} catch (err) {
  const out = {
    ok: false,
    error: err.message,
    pilotAllowed: false,
    implementationAllowed: false,
    generatedAt: new Date().toISOString(),
  };
  if (args.json) console.log(JSON.stringify(out, null, 2));
  else console.error(err);
  process.exit(1);
}
