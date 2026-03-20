import { execSync } from 'child_process';
import { resolve } from 'path';
import type { ToolHandler } from './types.js';

export const glob: ToolHandler = async (args, context) => {
  const pattern = String(args.pattern);
  const cwd = args.cwd ? resolve(context.workingDirectory, String(args.cwd)) : context.workingDirectory;

  try {
    const result = execSync(`npx glob "${pattern}"`, {
      cwd,
      encoding: 'utf8',
      timeout: 10_000,
    }).trim();
    return result || 'No files matched.';
  } catch {
    return `No files matched pattern: ${pattern}`;
  }
};

export const grep: ToolHandler = async (args, context) => {
  const pattern = String(args.pattern);
  const searchPath = args.path
    ? resolve(context.workingDirectory, String(args.path))
    : context.workingDirectory;

  try {
    const flags = ['-rn', '--color=never', '--max-count=50'];
    if (args.includes) {
      const includes = Array.isArray(args.includes) ? args.includes : [args.includes];
      for (const inc of includes) {
        flags.push(`--include="${inc}"`);
      }
    }

    const cmd = `rg ${flags.join(' ')} "${pattern}" "${searchPath}"`;
    const result = execSync(cmd, {
      encoding: 'utf8',
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    }).trim();

    return result || 'No matches found.';
  } catch {
    return `No matches found for pattern: ${pattern}`;
  }
};
