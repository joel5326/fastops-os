import { execSync } from 'child_process';
import { resolve } from 'path';
import type { ToolHandler } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 512 * 1024;

export const bash: ToolHandler = async (args, context) => {
  const command = String(args.command);
  const cwd = args.cwd
    ? resolve(context.workingDirectory, String(args.cwd))
    : context.workingDirectory;
  const timeout = typeof args.timeout === 'number'
    ? args.timeout * 1000
    : DEFAULT_TIMEOUT_MS;

  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf8',
      timeout,
      maxBuffer: MAX_OUTPUT_BYTES,
      shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
    });

    return output.trim() || '(command completed with no output)';
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'killed' in err && err.killed) {
      throw new Error(`Command timed out after ${timeout / 1000}s: ${command}`);
    }

    const execErr = err as { stdout?: string; stderr?: string; status?: number };
    const stdout = execErr.stdout?.trim() ?? '';
    const stderr = execErr.stderr?.trim() ?? '';
    const status = execErr.status ?? 1;

    return `Exit code: ${status}\n${stdout}\n${stderr}`.trim();
  }
};
