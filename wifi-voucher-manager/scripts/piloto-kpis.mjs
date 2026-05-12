import { argv, exit, env, platform } from 'node:process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SUCCESS_THRESHOLD = 0.95;

function defaultDbPath() {
  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'wifi-voucher-manager', 'data.db');
  }
  if (platform === 'win32') {
    return join(env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'wifi-voucher-manager', 'data.db');
  }
  return join(homedir(), '.config', 'wifi-voucher-manager', 'data.db');
}

function parseArgs(args) {
  const opts = { db: defaultDbPath(), format: 'text' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db' && args[i + 1]) { opts.db = args[++i]; }
    else if (args[i] === '--format' && args[i + 1]) { opts.format = args[++i]; }
    else if (args[i] === '--help' || args[i] === '-h') { opts.help = true; }
  }
  return opts;
}

export async function computeKpis(db) {
  const printTotalRow = await db('print_log').count({ c: '*' }).first();
  const printSuccessRow = await db('print_log').where('success', 1).count({ c: '*' }).first();
  const totalPrints = Number(printTotalRow?.c ?? 0);
  const successfulPrints = Number(printSuccessRow?.c ?? 0);
  const printSuccessRate = totalPrints > 0 ? successfulPrints / totalPrints : null;

  const rotTotalRow = await db('audit_log').where('event_type', 'password_rotation').count({ c: '*' }).first();
  const rotSuccessRow = await db('audit_log')
    .where('event_type', 'password_rotation')
    .whereRaw("json_extract(payload, '$.success') = 1")
    .count({ c: '*' })
    .first();
  const totalRotations = Number(rotTotalRow?.c ?? 0);
  const successfulRotations = Number(rotSuccessRow?.c ?? 0);
  const rotationSuccessRate = totalRotations > 0 ? successfulRotations / totalRotations : null;

  const meetsTargets =
    printSuccessRate !== null &&
    rotationSuccessRate !== null &&
    printSuccessRate >= SUCCESS_THRESHOLD &&
    rotationSuccessRate >= SUCCESS_THRESHOLD;

  const lastPrintRow = await db('print_log').where('success', 1).orderBy('id', 'desc').first();
  const lastRotationRow = await db('audit_log')
    .where('event_type', 'password_rotation')
    .whereRaw("json_extract(payload, '$.success') = 1")
    .orderBy('id', 'desc')
    .first();
  const lastActivityIso =
    (lastPrintRow?.printed_at ?? null) > (lastRotationRow?.created_at ?? null)
      ? lastPrintRow?.printed_at
      : lastRotationRow?.created_at;
  const daysWithoutService = lastActivityIso
    ? Math.floor((Date.now() - new Date(lastActivityIso).getTime()) / 86_400_000)
    : null;

  return {
    totalPrints,
    successfulPrints,
    failedPrints: totalPrints - successfulPrints,
    printSuccessRate,
    totalRotations,
    successfulRotations,
    failedRotations: totalRotations - successfulRotations,
    rotationSuccessRate,
    daysWithoutService,
    meetsTargets,
  };
}

function formatText(k) {
  const pct = (n) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
  const lines = [
    '=== KPIs del Piloto ===',
    '',
    `Impresiones: ${k.successfulPrints}/${k.totalPrints} exitosas (${pct(k.printSuccessRate)})`,
    `Rotaciones:  ${k.successfulRotations}/${k.totalRotations} exitosas (${pct(k.rotationSuccessRate)})`,
    `Días sin servicio: ${k.daysWithoutService ?? 'n/a (sin actividad registrada)'}`,
    '',
    `Cumple objetivos (>=95% ambos): ${k.meetsTargets ? '✓ SÍ' : '✗ NO'}`,
  ];
  return lines.join('\n');
}

async function main() {
  const opts = parseArgs(argv.slice(2));
  if (opts.help) {
    console.warn('Uso: node scripts/piloto-kpis.mjs [--db <path>] [--format text|json]');
    return;
  }
  const Knex = (await import('knex')).default;
  const db = Knex({
    client: 'better-sqlite3',
    connection: { filename: opts.db },
    useNullAsDefault: true,
  });
  try {
    const k = await computeKpis(db);
    if (opts.format === 'json') {
      console.warn(JSON.stringify(k, null, 2));
    } else {
      console.warn(formatText(k));
    }
  } finally {
    await db.destroy();
  }
}

const isDirectInvocation = import.meta.url === `file://${argv[1]}`;
if (isDirectInvocation) {
  main().catch((err) => {
    console.error('[piloto-kpis] Error:', err.message);
    exit(1);
  });
}
