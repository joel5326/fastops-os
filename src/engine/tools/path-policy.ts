/**
 * Sandbox resolution for Phase 1 agent tools.
 * All file paths and process cwd values must stay inside sandboxRoot.
 */
import { resolve, relative, isAbsolute } from 'path';

/**
 * Throws if candidatePath (resolved) is not under sandboxRoot.
 * Handles Windows cross-drive escape: path.relative returns an absolute path when roots differ.
 */
export function assertPathInsideSandbox(candidatePath: string, sandboxRoot: string): void {
  const root = resolve(sandboxRoot);
  const cand = resolve(candidatePath);
  const rel = relative(root, cand);

  if (rel === '') return;

  if (rel.startsWith('..') || rel === '..') {
    throw new Error(`Path escapes sandbox: ${candidatePath}`);
  }

  if (isAbsolute(rel)) {
    throw new Error(`Path escapes sandbox (cross-root): ${candidatePath}`);
  }
}

/**
 * Resolve a user-supplied path (relative to workingDir or absolute) and enforce sandbox.
 */
export function resolveSandboxedPath(
  raw: string,
  workingDir: string,
  sandboxRoot: string,
): string {
  const combined = isAbsolute(raw) ? raw : resolve(workingDir, raw);
  const full = resolve(combined);
  assertPathInsideSandbox(full, sandboxRoot);
  return full;
}
