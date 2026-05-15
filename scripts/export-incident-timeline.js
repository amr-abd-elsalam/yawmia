#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/export-incident-timeline.js — Phase 54 Incident Export CLI
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/export-incident-timeline.js --id=inc_x
//   node scripts/export-incident-timeline.js --list
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

async function main() {
  const incidentId = getArg('id', '');
  const list = process.argv.includes('--list');

  console.log('\n🚨 يوميّة Incident Timeline Export\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { listIncidents, getIncident } = await import('../server/services/incidentTimeline.js');

  if (list || !incidentId) {
    const result = await listIncidents({ limit: 50 });
    const incidents = result.incidents || [];

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
    console.error(`❌ Incident not found: ${incidentId}`);
    process.exit(1);
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
  console.error('\n❌ Incident export failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
