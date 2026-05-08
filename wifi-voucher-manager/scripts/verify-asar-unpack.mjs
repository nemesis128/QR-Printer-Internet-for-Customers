#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const installerDir = 'dist-installer';
if (!fs.existsSync(installerDir)) {
  console.warn('[verify-asar-unpack] SKIP: dist-installer no existe (no hay build empaquetado).');
  process.exit(0);
}

// 4 native deps after dropping @thiagoelg/node-printer (D-023)
const requiredModules = ['better-sqlite3', '@abandonware/noble', 'serialport', 'argon2'];

function findAsarUnpacked(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'app.asar.unpacked') return full;
      const recurse = findAsarUnpacked(full);
      if (recurse) return recurse;
    }
  }
  return null;
}

const unpacked = findAsarUnpacked(installerDir);
if (!unpacked) {
  console.warn(
    '[verify-asar-unpack] SKIP: app.asar.unpacked no encontrado (instalador NSIS comprime distinto). Validar manualmente en target Win11.'
  );
  process.exit(0);
}

const nodeModulesPath = path.join(unpacked, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.error('[verify-asar-unpack] FAIL: node_modules no encontrado en app.asar.unpacked');
  process.exit(1);
}

const missing = [];
for (const mod of requiredModules) {
  if (!fs.existsSync(path.join(nodeModulesPath, mod))) missing.push(mod);
}

if (missing.length > 0) {
  console.error(`[verify-asar-unpack] FAIL: módulos no unpacked: ${missing.join(', ')}`);
  console.error(`  Verifica electron-builder.yml > asarUnpack`);
  process.exit(1);
}

console.warn(
  `[verify-asar-unpack] OK: ${requiredModules.length} módulos nativos correctamente unpacked.`
);
