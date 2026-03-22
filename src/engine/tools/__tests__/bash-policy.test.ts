import { describe, it, expect } from 'vitest';
import {
  classifyBashCommand,
  shouldBlockBashInEnterprise,
} from '../bash-policy.js';

describe('classifyBashCommand', () => {
  it('marks obvious destructive commands as unrestricted', () => {
    expect(classifyBashCommand('rm -rf ./build').tier).toBe('unrestricted');
    expect(classifyBashCommand('sudo apt update').tier).toBe('unrestricted');
    expect(classifyBashCommand('docker run --rm alpine').tier).toBe('unrestricted');
  });

  it('marks package and git writes as write_restricted', () => {
    expect(classifyBashCommand('npm install').tier).toBe('write_restricted');
    expect(classifyBashCommand('git commit -m x').tier).toBe('write_restricted');
  });

  it('marks read-only diagnostics', () => {
    expect(classifyBashCommand('git status').tier).toBe('read_only');
    expect(classifyBashCommand('ls -la').tier).toBe('read_only');
    expect(classifyBashCommand('echo hello').tier).toBe('read_only');
  });

  it('defaults unknown commands to write_restricted', () => {
    expect(classifyBashCommand('some-unknown-binary --help').tier).toBe('write_restricted');
  });
});

describe('shouldBlockBashInEnterprise', () => {
  it('blocks unrestricted unless break-glass', () => {
    expect(shouldBlockBashInEnterprise('unrestricted', false)).toBe(true);
    expect(shouldBlockBashInEnterprise('unrestricted', true)).toBe(false);
  });

  it('allows read_only and write_restricted', () => {
    expect(shouldBlockBashInEnterprise('read_only', false)).toBe(false);
    expect(shouldBlockBashInEnterprise('write_restricted', false)).toBe(false);
  });
});
