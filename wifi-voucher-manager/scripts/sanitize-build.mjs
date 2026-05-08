#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && /\.(js|mjs|cjs)$/.test(entry.name)) yield full;
  }
}

const targets = ['dist', 'dist-electron'];
let violations = 0;

for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  for (const file of walk(target)) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(/console\.log\s*\(/g);
    if (matches) {
      console.error(`[sanitize-build] ${file}: ${matches.length} ocurrencia(s) de console.log`);
      violations += matches.length;
    }
  }
}

if (violations > 0) {
  console.error(
    `[sanitize-build] FAIL: ${violations} violación(es) encontradas. Reemplaza console.log por electron-log o console.warn/error.`
  );
  process.exit(1);
}

console.warn('[sanitize-build] OK: sin console.log en builds.');
