/**
 * Bash risk tiers — Phase 1 trust boundary (blast-off).
 * cwd/path are sandboxed separately; this classifies the *command string* only.
 */
export type BashRiskTier = 'read_only' | 'write_restricted' | 'unrestricted';

export interface BashClassification {
  tier: BashRiskTier;
  reasons: string[];
}

const UNRESTRICTED_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\brm\s+(-[rf]+\s+|\s+)(\/|\.\.|~\/)/i, reason: 'destructive-rm' },
  { re: /\brm\s+-rf\b/i, reason: 'rm-rf' },
  { re: /\bRemove-Item\b.*\s(-Recurse|-r)\b/i, reason: 'powershell-rm-recurse' },
  { re: /\bformat\b\s+[a-z]:/i, reason: 'disk-format' },
  { re: /\bdd\s+if=/i, reason: 'dd-raw' },
  { re: /\b(curl|wget)\s+[^\n]*\s(-o|--output|-O)\s+[^\s]|\bInvoke-WebRequest\b.*-OutFile/i, reason: 'download-to-file' },
  { re: /\b(curl|wget)\s+[^\n]*\s+[>|]\s*[^\s]*[\\/]?(etc|windows|system32|program files)/i, reason: 'redirect-system-path' },
  { re: /\bchmod\s+777\b|\bchown\s+/i, reason: 'permission-escalation' },
  { re: /\b(sudo|runas)\b/i, reason: 'privilege-elevation' },
  { re: /\breg(\.exe)?\s+(add|delete|import)/i, reason: 'registry-write' },
  { re: /\bmkfs\.|diskpart\b/i, reason: 'storage-destructive' },
  { re: /:\(\)\s*\{\s*:\|:&\s*\}\s*;/, reason: 'fork-bomb' },
  { re: /\bdocker\s+run\b/i, reason: 'docker-run' },
  { re: /\bssh\s+.*\s+(sudo|rm)\b/i, reason: 'remote-destructive' },
];

const WRITE_RESTRICTED_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bnpm\s+(install|i|ci|add|publish|uninstall)\b/i, reason: 'npm-write' },
  { re: /\b(yarn|pnpm)\s+(add|install|remove)\b/i, reason: 'pkg-write' },
  { re: /\bgit\s+(add|commit|push|pull|clone|merge|rebase|reset)\b/i, reason: 'git-write' },
  { re: /\b(tsc|vite|webpack|rollup|next)\s+(build|dev)/i, reason: 'build-tool' },
  { re: /\bnode\s+(?!-e\b)/i, reason: 'node-exec' },
  { re: /\b(npm|yarn|pnpm)\s+run\b/i, reason: 'npm-script' },
  { re: /\bNew-Item\b|\bSet-Content\b|\bOut-File\b/i, reason: 'powershell-write' },
  { re: /\b(copy|move|xcopy|robocopy)\s+/i, reason: 'file-copy' },
  { re: /\bmkdir\b|\bmd\s+/i, reason: 'mkdir' },
  { re: /\btouch\b/i, reason: 'touch' },
];

const READ_ONLY_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /^\s*(ls|dir|Get-ChildItem|gci)\b/i, reason: 'list' },
  { re: /\bgit\s+(status|diff|log|show|branch)\b/i, reason: 'git-read' },
  { re: /\b(cat|type|Get-Content|more|less)\b/i, reason: 'read-file' },
  { re: /\becho\s+/i, reason: 'echo' },
  { re: /\bwhere\b|\bwhich\b/i, reason: 'which' },
  { re: /\bnpm\s+(ls|list|outdated|test|run\s+test)\b/i, reason: 'npm-read' },
];

function firstMatch(
  command: string,
  patterns: Array<{ re: RegExp; reason: string }>,
): string | null {
  for (const { re, reason } of patterns) {
    if (re.test(command)) return reason;
  }
  return null;
}

/**
 * Classify a shell command string. Conservative: unknown commands are write_restricted.
 */
export function classifyBashCommand(command: string): BashClassification {
  const trimmed = command.trim();
  if (!trimmed) {
    return { tier: 'read_only', reasons: ['empty'] };
  }

  if (firstMatch(trimmed, UNRESTRICTED_PATTERNS)) {
    const reasons = UNRESTRICTED_PATTERNS.filter((p) => p.re.test(trimmed)).map((p) => p.reason);
    return { tier: 'unrestricted', reasons: [...new Set(reasons)] };
  }

  if (firstMatch(trimmed, WRITE_RESTRICTED_PATTERNS)) {
    const reasons = WRITE_RESTRICTED_PATTERNS.filter((p) => p.re.test(trimmed)).map((p) => p.reason);
    return { tier: 'write_restricted', reasons: [...new Set(reasons)] };
  }

  if (firstMatch(trimmed, READ_ONLY_PATTERNS)) {
    const reasons = READ_ONLY_PATTERNS.filter((p) => p.re.test(trimmed)).map((p) => p.reason);
    return { tier: 'read_only', reasons: [...new Set(reasons)] };
  }

  return { tier: 'write_restricted', reasons: ['unknown-default'] };
}

export interface EnterpriseBashGateOptions {
  /** FASTOPS_BASH_ALLOW_ELEVATED=1 — allow unrestricted in enterprise. */
  allowElevated: boolean;
  /** FASTOPS_BASH_ALLOW_WRITE=1 — allow write_restricted when strict mode is on. */
  allowWrite: boolean;
  /** FASTOPS_ENTERPRISE_BASH_STRICT=1 — block write_restricted unless allowWrite. */
  strictMode: boolean;
}

/**
 * Enterprise: unrestricted blocked unless break-glass; write_restricted blocked in strict mode unless write break-glass.
 */
export function shouldBlockBashInEnterprise(
  tier: BashRiskTier,
  allowElevated: boolean,
): boolean {
  return resolveEnterpriseBashGate(tier, {
    allowElevated,
    allowWrite: false,
    strictMode: false,
  }).blocked;
}

export function resolveEnterpriseBashGate(
  tier: BashRiskTier,
  opts: EnterpriseBashGateOptions,
): { blocked: boolean; reason?: string } {
  if (tier === 'read_only') {
    return { blocked: false };
  }
  if (tier === 'unrestricted') {
    if (opts.allowElevated) return { blocked: false };
    return { blocked: true, reason: 'unrestricted_requires_break_glass' };
  }
  // write_restricted
  if (opts.strictMode && !opts.allowWrite) {
    return { blocked: true, reason: 'write_restricted_requires_break_glass' };
  }
  return { blocked: false };
}
