#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/anonymize-user-data.js — User Data Anonymization CLI (Phase 58/61.4)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/anonymize-user-data.js --userId=usr_x --dry-run --json
//   node scripts/anonymize-user-data.js --userId=usr_x --confirm --json --approvalId=apr_x --backupRef=brd_x
//
// Safety:
//   - Default is dry-run.
//   - Destructive mutation requires --confirm.
//   - Confirmed mode also requires --approvalId=apr_x.
//   - Confirmed mode also requires --backupRef=<backup-or-restore-drill-reference>.
//   - --json emits machine-readable output.
//   - Dry-run never mutates user data.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;
const JSON_OUT = process.argv.includes('--json');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function buildConfirmCommand({ userId, approvalId, backupRef }) {
  const parts = [
    'node scripts/anonymize-user-data.js',
    `--userId=${userId}`,
    '--confirm',
    '--json',
  ];

  if (approvalId) parts.push(`--approvalId=${approvalId}`);
  else parts.push('--approvalId=apr_x');

  if (backupRef) parts.push(`--backupRef=${backupRef}`);
  else parts.push('--backupRef=brd_or_backup_reference');

  return parts.join(' ');
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function printHumanPreview({ userId, preview, confirmCommand }) {
  console.log(`\n🕶️ يوميّة User Anonymization (DRY RUN)\n`);
  console.log(`User: ${userId}\n`);
  console.log('Preview:');
  console.log(JSON.stringify(preview, null, 2));
  console.log('\nNo data was changed.');
  console.log('\nTo apply destructive anonymization after approval + backup evidence:');
  console.log(`  ${confirmCommand}\n`);
}

function printHumanBlocked(result) {
  console.error('\n❌ User anonymization blocked');
  console.error(`   code: ${result.code}`);
  console.error(`   error: ${result.error}`);

  if (result.blockers && result.blockers.length > 0) {
    console.error('\nBlockers:');
    for (const blocker of result.blockers) {
      console.error(`   - ${blocker.code}: ${blocker.message}`);
    }
  }

  if (result.confirmCommand) {
    console.error('\nConfirm command after resolving blockers:');
    console.error(`   ${result.confirmCommand}`);
  }

  console.error('');
}

async function main() {
  const started = Date.now();
  const userId = getArg('userId', '');
  const approvalId = getArg('approvalId', '');
  const backupRef = getArg('backupRef', '');

  if (!userId) {
    const output = {
      ok: false,
      dryRun: DRY_RUN,
      confirm: CONFIRM,
      mutationPerformed: false,
      code: 'USER_ID_REQUIRED',
      error: 'Missing --userId=usr_x',
      generatedAt: new Date().toISOString(),
    };

    if (JSON_OUT) printJson(output);
    else console.error('❌ Missing --userId=usr_x');

    process.exit(1);
  }

  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  if (JSON_OUT) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const {
    previewUserAnonymization,
    anonymizeUserData,
  } = await import('../server/services/userAnonymization.js');

  const confirmCommand = buildConfirmCommand({ userId, approvalId, backupRef });

  if (DRY_RUN) {
    const preview = await previewUserAnonymization(userId);

    const output = {
      ok: !!preview.ok,
      dryRun: true,
      confirm: CONFIRM,
      mutationPerformed: false,
      userId,
      approvalId: approvalId || null,
      backupRef: backupRef || null,
      preview,
      confirmCommand,
      warnings: [
        'dry-run performs no anonymization mutation',
        'confirmed anonymization is irreversible privacy mutation',
        'confirmed mode requires --approvalId and --backupRef',
        'prefer admin privacy request workflow when possible',
      ],
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(output);
    } else if (preview.ok) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printHumanPreview({ userId, preview, confirmCommand });
    } else {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.error(`❌ Preview failed: ${preview.error || preview.code}`);
    }

    if (!preview.ok) process.exit(1);
    return;
  }

  const blockers = [];

  if (!approvalId) {
    blockers.push({
      code: 'APPROVAL_ID_REQUIRED',
      message: 'Confirmed anonymization requires --approvalId=apr_x',
    });
  }

  if (!backupRef) {
    blockers.push({
      code: 'BACKUP_REFERENCE_REQUIRED',
      message: 'Confirmed anonymization requires --backupRef=<backup-or-restore-drill-reference>',
    });
  }

  if (blockers.length > 0) {
    const output = {
      ok: false,
      dryRun: false,
      confirm: true,
      mutationPerformed: false,
      code: 'CONFIRM_PREFLIGHT_BLOCKED',
      error: 'Confirmed anonymization requires approval and backup evidence',
      userId,
      approvalId: approvalId || null,
      backupRef: backupRef || null,
      blockers,
      confirmCommand,
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(output);
    } else {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printHumanBlocked(output);
    }

    process.exit(2);
  }

  const approvals = await import('../server/services/adminApprovals.js');
  const approvalValid = await approvals.isApprovalValid(approvalId, 'privacy_anonymize', userId);

  if (!approvalValid) {
    const output = {
      ok: false,
      dryRun: false,
      confirm: true,
      mutationPerformed: false,
      code: 'APPROVAL_INVALID',
      error: 'Approval is missing, expired, already consumed, wrong action, or target mismatch',
      userId,
      approvalId,
      backupRef,
      blockers: [{
        code: 'APPROVAL_INVALID',
        message: 'Expected approved action=privacy_anonymize for targetId=userId',
      }],
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(output);
    } else {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printHumanBlocked(output);
    }

    process.exit(2);
  }

  if (!JSON_OUT) {
    console.log('\n🕶️ يوميّة User Anonymization — CONFIRMED\n');
    console.log('⚠️  This will mutate user data irreversibly.');
    console.log(`User: ${userId}`);
    console.log(`Approval: ${approvalId}`);
    console.log(`Backup reference: ${backupRef}\n`);
  }

  const result = await anonymizeUserData(userId, {
    dryRun: false,
    preview: false,
  });

  if (!result.ok) {
    const output = {
      ok: false,
      dryRun: false,
      confirm: true,
      mutationPerformed: false,
      userId,
      approvalId,
      backupRef,
      code: result.code || 'ANONYMIZATION_FAILED',
      error: result.error || 'Anonymization failed',
      partialResult: result.partialResult || null,
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(output);
    } else {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.error(`❌ Anonymization failed: ${output.error}`);
      if (output.partialResult) console.error(JSON.stringify(output.partialResult, null, 2));
    }

    process.exit(1);
  }

  const consumeResult = await approvals.consumeApproval(approvalId, 'privacy_anonymize', userId).catch(err => ({
    ok: false,
    error: err.message,
  }));

  const output = {
    ok: !!result.ok && !!consumeResult.ok,
    dryRun: false,
    confirm: true,
    mutationPerformed: true,
    userId,
    anonId: result.anonId || null,
    approvalId,
    approvalConsumed: !!consumeResult.ok,
    approvalConsumeError: consumeResult.ok ? null : (consumeResult.error || consumeResult.code || 'APPROVAL_CONSUME_FAILED'),
    backupRef,
    idempotent: !!result.idempotent,
    durationMs: result.durationMs || (Date.now() - started),
    result: result.result || {},
    warnings: consumeResult.ok ? [] : [
      'anonymization mutation completed but approval consumption failed; review approval record manually',
    ],
    completedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    printJson(output);
  } else {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;

    console.log('✅ Anonymization complete');
    console.log(`   userId: ${userId}`);
    console.log(`   anonId: ${output.anonId}`);
    console.log(`   idempotent: ${output.idempotent ? 'yes' : 'no'}`);
    console.log(`   approvalConsumed: ${output.approvalConsumed ? 'yes' : 'no'}`);
    console.log(`   backupRef: ${backupRef}`);
    console.log(`   durationMs: ${output.durationMs || 0}`);
    console.log('\nResult:');
    console.log(JSON.stringify(output.result || {}, null, 2));
    console.log('');
  }

  if (!output.ok) process.exit(1);
}

main().catch(err => {
  const payload = {
    ok: false,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: false,
    error: err.message,
    stack: err.stack || null,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(payload);
  } else {
    console.error('\n❌ User anonymization failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
