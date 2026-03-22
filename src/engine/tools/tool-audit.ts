import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const PREVIEW_MAX = 500;

export function hashCommandSnippet(command: string): string {
  return createHash('sha256').update(command, 'utf8').digest('hex').slice(0, 24);
}

export function commandPreview(command: string): string {
  const t = command.trim();
  if (t.length <= PREVIEW_MAX) return t;
  return t.slice(0, PREVIEW_MAX) + '…';
}

/**
 * Append one JSONL line for tool audit (bash and future tools).
 */
export function appendToolAuditLog(
  auditDir: string | undefined,
  entry: Record<string, unknown>,
): void {
  if (!auditDir) return;
  if (!existsSync(auditDir)) {
    mkdirSync(auditDir, { recursive: true });
  }
  const dateStr = new Date().toISOString().split('T')[0];
  const file = join(auditDir, `tool-${dateStr}.jsonl`);
  appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8');
}
