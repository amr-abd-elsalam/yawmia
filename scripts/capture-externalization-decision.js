#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/capture-externalization-decision.js — Phase 60 Decision
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
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/capture-externalization-decision.js
  node scripts/capture-externalization-decision.js --json
  node scripts/capture-externalization-decision.js --persist

Phase 60:
  Aggregates evidence into an advisory decision.
  Does not implement external DB/search/queue.
`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

try {
  let result;

  if (args.persist) {
    const { captureExternalizationDecisionSnapshot } = await import('../server/services/externalizationDecision.js');
    result = await captureExternalizationDecisionSnapshot({ allowPilotCandidate: false });
    result = result.decision || result;
  } else {
    const { getExternalizationDecisionReport } = await import('../server/services/externalizationDecision.js');
    result = await getExternalizationDecisionReport({ allowPilotCandidate: false });
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Phase: ${result.phase}`);
    console.log(`Status: ${result.status}`);
    console.log(`Implementation allowed: ${result.implementationAllowed ? 'yes' : 'no'}`);
    console.log(`Candidates: ${(result.candidates || []).length}`);
    console.log(`Recommendations: ${(result.recommendations || []).length}`);
    console.log('\nTop candidates:');
    for (const c of (result.candidates || []).slice(0, 5)) {
      console.log(`- ${c.candidate}: ${c.status} (${Math.round((c.score || 0) * 100)}%)`);
    }
  }

  process.exit(0);
} catch (err) {
  const out = { ok: false, error: err.message };
  if (args.json) console.log(JSON.stringify(out, null, 2));
  else console.error(err);
  process.exit(1);
}
