#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/export-incident-timeline.js — Phase 54 Incident Export CLI
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/export-incident-timeline.js --list
//   node scripts/export-incident-timeline.js --list --json
//   node scripts/export-incident-timeline.js --id=inc_x
//   node scripts/export-incident-timeline.js --id=inc_x --json
//
// Read-only:
//   Does not mutate incident records or source data.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  const started = Date.now();
  const incidentId = getArg('id', '');
  const list = process.argv.includes('--list');

  if (!JSON_OUT) {
    console.log('\n🚨 يوميّة Incident Timeline Export\n');
  }

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { listIncidents, getIncident } = await import('../server/services/incidentTimeline.js');

  if (list || !incidentId) {
    const result = await listIncidents({ limit: 50 });
    const incidents = result.incidents || [];

    const output = {
      ok: true,
      dryRun: true,
      mutationPerformed: false,
      sourceDataMutated: false,
      mode: 'list',
      incidents,
      total: incidents.length,
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      printJson(output);
      return;
    }

    if (incidents.length === 0) {
      console.log('No incidents found.\n');
      return;
    }

    for (const inc of incidents) {
      console.log(`${inc.id}  [${inc.status}] [${inc.severity}]  ${inc.title}`);
    }
    console.log('\nUse --id=inc_x to print full timeline.\n');
    return;
  }

  const incident = await getIncident(incidentId);

  if (!incident) {
    const output = {
      ok: false,
      dryRun: true,
      mutationPerformed: false,
      sourceDataMutated: false,
      mode: 'detail',
      incidentId,
      error: `Incident not found: ${incidentId}`,
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      printJson(output);
    } else {
      console.error(`❌ Incident not found: ${incidentId}`);
    }

    process.exit(1);
  }

  const output = {
    ok: true,
    dryRun: true,
    mutationPerformed: false,
    sourceDataMutated: false,
    mode: 'detail',
    incident,
    eventCount: Array.isArray(incident.events) ? incident.events.length : 0,
    durationMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(output);
    return;
  }

  console.log(`ID: ${incident.id}`);
  console.log(`Title: ${incident.title}`);
  console.log(`Severity: ${incident.severity}`);
  console.log(`Status: ${incident.status}`);
  console.log(`Opened: ${incident.openedAt}`);
  if (incident.resolvedAt) console.log(`Resolved: ${incident.resolvedAt} by ${incident.resolvedBy || '-'}`);
  console.log('\nTimeline:');

  for (const evt of incident.events || []) {
    console.log(`\n- ${evt.timestamp}  ${evt.type}`);
    console.log(`  ${evt.summary}`);
    if (evt.refs && Object.keys(evt.refs).length > 0) {
      console.log(`  refs: ${JSON.stringify(evt.refs)}`);
    }
  }

  console.log('');
}

main().catch(err => {
  const output = {
    ok: false,
    dryRun: true,
    mutationPerformed: false,
    sourceDataMutated: false,
    error: err.message,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(output);
  } else {
    console.error('\n❌ Incident export failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
