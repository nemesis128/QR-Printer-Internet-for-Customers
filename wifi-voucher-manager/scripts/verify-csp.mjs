#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const indexPath = path.resolve('dist/index.html');
if (!fs.existsSync(indexPath)) {
  console.error(`[verify-csp] FAIL: ${indexPath} no existe. Corre 'npm run build' primero.`);
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');
const cspMatch = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);

if (!cspMatch) {
  console.error('[verify-csp] FAIL: meta tag CSP no encontrado en dist/index.html');
  process.exit(1);
}

const csp = cspMatch[1];

if (csp.includes('unsafe-eval')) {
  console.error('[verify-csp] FAIL: producción contiene "unsafe-eval"');
  console.error(`  CSP actual: ${csp}`);
  process.exit(1);
}

if (csp.includes('localhost')) {
  console.error('[verify-csp] FAIL: producción contiene "localhost"');
  console.error(`  CSP actual: ${csp}`);
  process.exit(1);
}

if (!csp.includes("default-src 'self'")) {
  console.error('[verify-csp] FAIL: producción no tiene "default-src \'self\'"');
  console.error(`  CSP actual: ${csp}`);
  process.exit(1);
}

console.warn('[verify-csp] OK: CSP de producción es estricta.');
