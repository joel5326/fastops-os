#!/usr/bin/env node
/**
 * Migration script: copies operational state from the
 * "Fastops development process" workspace into the fastops-os repo.
 *
 * Usage: npx tsx src/migrate/from-dev-process.ts <source-dir>
 *   source-dir defaults to ../Fastops development process
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const sourceDir = process.argv[2] || join(process.cwd(), '..', 'Fastops development process');
const targetDir = process.cwd();

interface MigrationResult {
  component: string;
  files: number;
  status: 'ok' | 'skipped' | 'error';
  detail?: string;
}

const results: MigrationResult[] = [];

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function copyDir(src: string, dest: string, filter?: (name: string) => boolean): number {
  if (!existsSync(src)) return 0;
  ensureDir(dest);
  let count = 0;
  for (const name of readdirSync(src)) {
    if (filter && !filter(name)) continue;
    const srcPath = join(src, name);
    const destPath = join(dest, name);
    try {
      copyFileSync(srcPath, destPath);
      count++;
    } catch { /* skip dirs and broken files */ }
  }
  return count;
}

function migrateComms(): void {
  const src = join(sourceDir, 'comms', 'data');
  const dest = join(targetDir, '.fastops-engine', 'comms');
  if (!existsSync(src)) {
    results.push({ component: 'comms', files: 0, status: 'skipped', detail: 'Source not found' });
    return;
  }
  const count = copyDir(src, dest, (n) => n.endsWith('.jsonl'));
  const rosterSrc = join(src, 'roster.json');
  if (existsSync(rosterSrc)) {
    copyFileSync(rosterSrc, join(dest, 'roster.json'));
  }
  results.push({ component: 'comms', files: count, status: 'ok' });
}

function migrateKnowledgeBase(): void {
  const src = join(sourceDir, '.fastops', 'knowledge-base.jsonl');
  const dest = join(targetDir, '.fastops-engine', 'knowledge-base.jsonl');
  if (!existsSync(src)) {
    results.push({ component: 'knowledge-base', files: 0, status: 'skipped', detail: 'No KB found' });
    return;
  }
  ensureDir(join(targetDir, '.fastops-engine'));
  copyFileSync(src, dest);
  const lines = readFileSync(src, 'utf8').trim().split('\n').filter(Boolean);
  results.push({ component: 'knowledge-base', files: 1, status: 'ok', detail: `${lines.length} entries` });
}

function migrateContracts(): void {
  const src = join(sourceDir, 'contracts', 'fastops-os');
  const dest = join(targetDir, 'contracts');
  if (!existsSync(src)) {
    results.push({ component: 'contracts', files: 0, status: 'skipped', detail: 'No contracts dir' });
    return;
  }
  const count = copyDir(src, dest, (n) => n.endsWith('.md'));
  results.push({ component: 'contracts', files: count, status: 'ok' });
}

function migrateEvidence(): void {
  const src = join(sourceDir, 'evidence');
  const dest = join(targetDir, 'evidence');
  if (!existsSync(src)) {
    results.push({ component: 'evidence', files: 0, status: 'skipped' });
    return;
  }

  let total = 0;
  const subdirs = ['onboarding', 'maturity'];
  for (const sub of subdirs) {
    const subSrc = join(src, sub);
    const subDest = join(dest, sub);
    if (existsSync(subSrc)) {
      total += copyDir(subSrc, subDest);
    }
  }
  results.push({ component: 'evidence', files: total, status: 'ok' });
}

function migrateMissions(): void {
  const src = join(sourceDir, 'missions');
  const dest = join(targetDir, 'missions');
  if (!existsSync(src)) {
    results.push({ component: 'missions', files: 0, status: 'skipped' });
    return;
  }
  ensureDir(dest);
  let total = 0;
  for (const missionDir of readdirSync(src)) {
    const missionSrc = join(src, missionDir, 'MISSION.md');
    if (existsSync(missionSrc)) {
      const missionDest = join(dest, missionDir);
      ensureDir(missionDest);
      copyFileSync(missionSrc, join(missionDest, 'MISSION.md'));
      total++;
    }
  }
  results.push({ component: 'missions', files: total, status: 'ok' });
}

function migrateSessionDistills(): void {
  const src = join(sourceDir, '.fastops', 'session-distills');
  const dest = join(targetDir, '.fastops-engine', 'session-distills');
  if (!existsSync(src)) {
    results.push({ component: 'session-distills', files: 0, status: 'skipped' });
    return;
  }
  const count = copyDir(src, dest, (n) => n.endsWith('.jsonl'));
  results.push({ component: 'session-distills', files: count, status: 'ok' });
}

function migrateEnv(): void {
  const src = join(sourceDir, '.env');
  const dest = join(targetDir, '.env');
  if (!existsSync(src)) {
    results.push({ component: 'env', files: 0, status: 'skipped', detail: 'No .env in source' });
    return;
  }
  if (existsSync(dest)) {
    results.push({ component: 'env', files: 0, status: 'skipped', detail: '.env already exists in target' });
    return;
  }
  copyFileSync(src, dest);
  results.push({ component: 'env', files: 1, status: 'ok' });
}

console.log(`\n  FastOps OS — Migration from Development Process`);
console.log(`  Source: ${sourceDir}`);
console.log(`  Target: ${targetDir}\n`);

if (!existsSync(sourceDir)) {
  console.error(`  Source directory not found: ${sourceDir}`);
  process.exit(1);
}

migrateComms();
migrateKnowledgeBase();
migrateContracts();
migrateEvidence();
migrateMissions();
migrateSessionDistills();
migrateEnv();

console.log('  Results:');
for (const r of results) {
  const icon = r.status === 'ok' ? '✓' : r.status === 'skipped' ? '–' : '✗';
  const detail = r.detail ? ` (${r.detail})` : '';
  console.log(`    ${icon} ${r.component}: ${r.files} files${detail}`);
}

const totalFiles = results.reduce((s, r) => s + r.files, 0);
const errors = results.filter((r) => r.status === 'error');
console.log(`\n  Total: ${totalFiles} files migrated, ${errors.length} errors\n`);

writeFileSync(
  join(targetDir, '.fastops-engine', 'migration-log.json'),
  JSON.stringify({ ts: new Date().toISOString(), source: sourceDir, results }, null, 2),
);
