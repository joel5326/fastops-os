import { execSync } from 'child_process';
import type { ToolHandler, ToolContext } from './types.js';
import { resolveSandboxedPath } from './path-policy.js';
import { classifyBashCommand, resolveEnterpriseBashGate } from './bash-policy.js';
import {
  appendElevatedAuditLog,
  appendToolAuditLog,
  commandPreview,
  hashCommandSnippet,
} from './tool-audit.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 512 * 1024;

function auditBash(
  context: ToolContext,
  command: string,
  cwd: string,
  classification: ReturnType<typeof classifyBashCommand>,
  blocked: boolean,
  blockReason?: string,
): void {
  appendToolAuditLog(context.toolAuditDir, {
    type: 'bash',
    sessionId: context.sessionId,
    modelId: context.modelId,
    riskTier: classification.tier,
    reasons: classification.reasons,
    securityTier: context.securityTier ?? 'development',
    blocked,
    blockReason: blockReason ?? null,
    cwd,
    commandHash: hashCommandSnippet(command),
    commandPreview: commandPreview(command),
  });
}

function auditElevated(
  context: ToolContext,
  command: string,
  cwd: string,
  classification: ReturnType<typeof classifyBashCommand>,
  event: Record<string, unknown>,
): void {
  appendElevatedAuditLog(context.toolAuditDir, {
    type: 'bash_elevated',
    sessionId: context.sessionId,
    modelId: context.modelId,
    riskTier: classification.tier,
    reasons: classification.reasons,
    securityTier: context.securityTier ?? 'development',
    cwd,
    commandHash: hashCommandSnippet(command),
    commandPreview: commandPreview(command),
    ...event,
  });
}

function logElevatedIfNeeded(
  context: ToolContext,
  command: string,
  cwd: string,
  classification: ReturnType<typeof classifyBashCommand>,
  securityTier: 'development' | 'enterprise',
  gate: { blocked: boolean; reason?: string },
): void {
  const tier = classification.tier;
  const allowElevated = context.allowElevatedBash ?? false;
  const allowWrite = context.allowWriteBash ?? false;
  const strict = context.enterpriseBashStrict ?? false;

  if (tier === 'unrestricted' && !gate.blocked) {
    auditElevated(context, command, cwd, classification, {
      kind: 'unrestricted_executed',
      breakGlassElevated: securityTier === 'enterprise' && allowElevated,
    });
    return;
  }

  if (
    securityTier === 'enterprise' &&
    tier === 'write_restricted' &&
    strict &&
    allowWrite &&
    !gate.blocked
  ) {
    auditElevated(context, command, cwd, classification, {
      kind: 'write_restricted_break_glass',
      breakGlassWrite: true,
    });
  }
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
  const securityTier = context.securityTier ?? 'development';
  const allowElevated = context.allowElevatedBash ?? false;
  const allowWrite = context.allowWriteBash ?? false;
  const strictMode = context.enterpriseBashStrict ?? false;

  if (securityTier === 'enterprise') {
    const gate = resolveEnterpriseBashGate(classification.tier, {
      allowElevated,
      allowWrite,
      strictMode,
    });
    if (gate.blocked) {
      auditBash(context, command, cwd, classification, true, gate.reason);
      if (gate.reason === 'unrestricted_requires_break_glass') {
        throw new Error(
          'Blocked: unrestricted shell command in enterprise tier. ' +
            'Set FASTOPS_BASH_ALLOW_ELEVATED=1 to allow (break-glass).',
        );
      }
      throw new Error(
        'Blocked: write-restricted shell command in enterprise strict mode. ' +
          'Set FASTOPS_BASH_ALLOW_WRITE=1 or disable FASTOPS_ENTERPRISE_BASH_STRICT.',
      );
    }
  }

  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf8',
      timeout,
      maxBuffer: MAX_OUTPUT_BYTES,
      shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
    });

    const gate = securityTier === 'enterprise'
      ? resolveEnterpriseBashGate(classification.tier, {
        allowElevated,
        allowWrite,
        strictMode,
      })
      : { blocked: false as const };

    auditBash(context, command, cwd, classification, false);
    logElevatedIfNeeded(context, command, cwd, classification, securityTier, gate);
    return output.trim() || '(command completed with no output)';
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'killed' in err && err.killed) {
      const gate = securityTier === 'enterprise'
        ? resolveEnterpriseBashGate(classification.tier, {
          allowElevated,
          allowWrite,
          strictMode,
        })
        : { blocked: false as const };
      auditBash(context, command, cwd, classification, false);
      logElevatedIfNeeded(context, command, cwd, classification, securityTier, gate);
      throw new Error(`Command timed out after ${timeout / 1000}s: ${command}`);
    }

    const execErr = err as { stdout?: string; stderr?: string; status?: number };
    const stdout = execErr.stdout?.trim() ?? '';
    const stderr = execErr.stderr?.trim() ?? '';
    const status = execErr.status ?? 1;

    const gate = securityTier === 'enterprise'
      ? resolveEnterpriseBashGate(classification.tier, {
        allowElevated,
        allowWrite,
        strictMode,
      })
      : { blocked: false as const };
    auditBash(context, command, cwd, classification, false);
    logElevatedIfNeeded(context, command, cwd, classification, securityTier, gate);
    return `Exit code: ${status}\n${stdout}\n${stderr}`.trim();
  }
};
