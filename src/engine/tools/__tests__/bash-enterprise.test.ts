import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ToolExecutor } from '../executor.js';
import { bash } from '../bash.js';

describe('bash enterprise gate', () => {
  let auditDir: string;
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'fos-bash-'));
    auditDir = join(root, 'audit');
  });

  afterEach(() => {
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
  });

  it('blocks unrestricted commands in enterprise without break-glass and writes audit', async () => {
    const executor = new ToolExecutor();
    executor.register({ name: 'bash', description: 'bash', parameters: {} }, bash);

    const result = await executor.execute(
      {
        id: '1',
        name: 'bash',
        arguments: JSON.stringify({ command: 'rm -rf ./x' }),
      },
      {
        sessionId: 's1',
        modelId: 'claude',
        workingDirectory: root,
        sandboxRoot: root,
        securityTier: 'enterprise',
        allowElevatedBash: false,
        toolAuditDir: auditDir,
      },
    );

    expect(result.isError).toBe(true);
    expect(result.output).toContain('Blocked');

    const files = readdirSync(auditDir);
    expect(files.length).toBeGreaterThan(0);
    const content = readFileSync(join(auditDir, files[0]), 'utf8');
    const row = JSON.parse(content.trim().split('\n').pop()!);
    expect(row.blocked).toBe(true);
    expect(row.riskTier).toBe('unrestricted');
  });

  it('allows read_only commands in enterprise without break-glass', async () => {
    const executor = new ToolExecutor();
    executor.register({ name: 'bash', description: 'bash', parameters: {} }, bash);

    const result = await executor.execute(
      {
        id: '1',
        name: 'bash',
        arguments: JSON.stringify({ command: 'echo ok' }),
      },
      {
        sessionId: 's1',
        modelId: 'claude',
        workingDirectory: root,
        sandboxRoot: root,
        securityTier: 'enterprise',
        allowElevatedBash: false,
        toolAuditDir: auditDir,
      },
    );

    expect(result.isError).toBe(false);
    expect(result.output).toContain('ok');

    const files = readdirSync(auditDir);
    expect(files.length).toBeGreaterThan(0);
    const content = readFileSync(join(auditDir, files[0]), 'utf8');
    const row = JSON.parse(content.trim().split('\n').pop()!);
    expect(row.blocked).toBe(false);
    expect(row.riskTier).toBe('read_only');
  });
});
