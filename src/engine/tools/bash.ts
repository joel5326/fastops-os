import { execSync } from 'child_process';
import type { ToolHandler, ToolContext } from './types.js';
import { resolveSandboxedPath } from './path-policy.js';
import { classifyBashCommand, shouldBlockBashInEnterprise } from './bash-policy.js';
import { appendToolAuditLog, commandPreview, hashCommandSnippet } from './tool-audit.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 512 * 1024;

function auditBash(
  context: ToolContext,
  command: string,
  cwd: string,
  classification: ReturnType<typeof classifyBashCommand>,
  blocked: boolean,
): void {
  appendToolAuditLog(context.toolAuditDir, {
    type: 'bash',
    sessionId: context.sessionId,
    modelId: context.modelId,
    riskTier: classification.tier,
    reasons: classification.reasons,
    securityTier: context.securityTier ?? 'development',
    blocked,
    cwd,
    commandHash: hashCommandSnippet(command),
    commandPreview: commandPreview(command),
  });
}

export const bash: ToolHandler = async (args, context) => {
  const command = String(args.command);
  const cwd = resolveSandboxedPath(
    args.cwd ? String(args.cwd) : '.',
    context.workingDirectory,
    context.sandboxRoot,
  );
  const timeout = typeof args.timeout === 'number'
    ? args.timeout * 1000
    : DEFAULT_TIMEOUT_MS;

  const classification = classifyBashCommand(command);
  const tier = context.securityTier ?? 'development';
  const allowElevated = context.allowElevatedBash ?? false;

  if (tier === 'enterprise' && shouldBlockBashInEnterprise(classification.tier, allowElevated)) {
    auditBash(context, command, cwd, classification, true);
    throw new Error(
      'Blocked: unrestricted shell command in enterprise tier. ' +
        'Set FASTOPS_BASH_ALLOW_ELEVATED=1 to allow (break-glass).',
    );
  }

  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf8',
      timeout,
      maxBuffer: MAX_OUTPUT_BYTES,
      shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
    });

    auditBash(context, command, cwd, classification, false);
    return output.trim() || '(command completed with no output)';
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'killed' in err && err.killed) {
      auditBash(context, command, cwd, classification, false);
      throw new Error(`Command timed out after ${timeout / 1000}s: ${command}`);
    }

    const execErr = err as { stdout?: string; stderr?: string; status?: number };
    const stdout = execErr.stdout?.trim() ?? '';
    const stderr = execErr.stderr?.trim() ?? '';
    const status = execErr.status ?? 1;

    auditBash(context, command, cwd, classification, false);
    return `Exit code: ${status}\n${stdout}\n${stderr}`.trim();
  }
};
