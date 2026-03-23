import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { assertPathInsideSandbox, resolveSandboxedPath } from '../tools/path-policy.js';

describe('path-policy', () => {
  const sandbox = resolve('/project/repo');

  it('allows paths inside sandbox', () => {
    expect(() => assertPathInsideSandbox(resolve(sandbox, 'src/a.ts'), sandbox)).not.toThrow();
  });

  it('rejects traversal via ..', () => {
    // One .. from src/ stays inside repo; need ../../ to climb above sandbox root
    expect(() =>
      resolveSandboxedPath('../../outside', resolve(sandbox, 'src'), sandbox),
    ).toThrow(/escapes sandbox/);
  });

  it('rejects absolute paths outside sandbox', () => {
    expect(() => resolveSandboxedPath('/etc/passwd', sandbox, sandbox)).toThrow(/escapes sandbox/);
  });

  it('allows nested relative path from working dir', () => {
    const p = resolveSandboxedPath('foo/bar', sandbox, sandbox);
    expect(p).toBe(resolve(sandbox, 'foo/bar'));
  });
});
